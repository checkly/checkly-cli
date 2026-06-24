import { type AxiosInstance, isAxiosError } from 'axios'
import { Readable } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import type { GitInformation } from '../services/util.js'
import { compressJSONPayload } from './util.js'
import { SharedFile } from '../constructs/index.js'
import { ConflictError, ForbiddenError, handleErrorResponse, NotFoundError, RequestTimeoutError } from './errors.js'

export interface Project {
  name: string
  logicalId: string
  repoUrl?: string
}

type ProjectResponse = Project & { id: string, created_at: string }

export interface Change {
  logicalId: string
  physicalId?: string | number
  type: string
  action: string
}

export interface ResourceSync {
  logicalId: string
  physicalId?: string | number
  type: string
  member: boolean
  payload: any
}

export interface AlertChannelFriendResource {
  type: 'alert-channel'
  logicalId: string
  physicalId: number
}

export interface CheckGroupFriendResource {
  type: 'check-group'
  logicalId: string
  physicalId: number
}

export interface PrivateLocationFriendResource {
  type: 'private-location'
  logicalId: string
  physicalId: string
}

export interface StatusPageServiceFriendResource {
  type: 'status-page-service'
  logicalId: string
  physicalId: string
}

export type FriendResourceSync =
  AlertChannelFriendResource
  | CheckGroupFriendResource
  | PrivateLocationFriendResource
  | StatusPageServiceFriendResource

export interface AuxiliaryResourceSync {
  physicalId?: string | number
  type: string
  payload: any
}

export interface ProjectSync {
  project: Project
  sharedFiles?: SharedFile[]
  resources: Array<ResourceSync>
  repoInfo: GitInformation | null
}

export interface ProjectDeployResponse {
  project: Project
  diff: Array<Change>
}

export type ProjectDeploymentStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export interface ProjectDeployment {
  id: string
  logicalId: string
  status: ProjectDeploymentStatus
  dryRun: boolean
  /** Opaque progress percentage (0-100). */
  progress: number
  error: { code: string, message: string } | null
  /** The applied { project, diff }; present once the deployment has succeeded. */
  result: ProjectDeployResponse | null
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  /** When cancellation was requested for this deployment, or null if it was not. */
  cancelRequestedAt: string | null
}

export class ProjectDeployFailedError extends Error {
  constructor (message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectDeployFailedError'
  }
}

/** Internal: the SSE stream ended before a terminal event (eligible for reconnect). */
class DeploymentStreamInterruptedError extends Error {
  constructor () {
    super('The deployment event stream ended before completion.')
    this.name = 'DeploymentStreamInterruptedError'
  }
}

interface SseFrame {
  event: string
  data: any
}

function streamToString (stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.on('error', reject)
  })
}

/** Parse one SSE frame ("event: x\ndata: {...}"), assuming LF line endings.
 * Returns null for keep-alive comments or frames without parseable JSON data. */
function parseSseFrame (raw: string): SseFrame | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) {
      continue // keep-alive comment
    }
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }
  if (dataLines.length === 0) {
    return null
  }
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) }
  } catch {
    return null
  }
}

export interface ImportPlanFilter {
  type: 'include' | 'exclude'
  resource?: {
    type: string
    physicalId?: string | number
  }
}

export interface ImportPlanFriend {
  type: string
  logicalId: string
}

export interface ImportPlanOptions {
  preview?: boolean
  filters?: ImportPlanFilter[]
  friends?: ImportPlanFriend[]
}

export interface ImportPlanChanges {
  resources: ResourceSync[]
  friends?: FriendResourceSync[]
  auxiliary?: AuxiliaryResourceSync[]
}

export interface ImportPlan {
  id: string
  createdAt: string
  appliedAt?: string
  committedAt?: string
  changes?: ImportPlanChanges
}

export class ProjectNotFoundError extends Error {
  logicalId: string

  constructor (logicalId: string, options?: ErrorOptions) {
    super(`Project "${logicalId}" does not exist.`, options)
    this.name = 'ProjectNotFoundError'
    this.logicalId = logicalId
  }
}

export class ProjectAlreadyExistsError extends Error {
  logicalId: string

  constructor (logicalId: string, options?: ErrorOptions) {
    super(`You are already using the logicalId "${logicalId}" for a different project.`, options)
    this.name = 'ProjectAlreadyExistsError'
    this.logicalId = logicalId
  }
}

export class NoImportableResourcesFoundError extends Error {
  constructor (options?: ErrorOptions) {
    super(`No importable resources were found.`, options)
    this.name = 'NoImportableResourcesFoundError'
  }
}

export class ImportPlanNotFoundError extends Error {
  constructor (options?: ErrorOptions) {
    super(`Import plan does not exist.`, options)
    this.name = 'ImportPlanNotFoundError'
  }
}

export class InvalidImportPlanStateError extends Error {
  constructor (options?: ErrorOptions) {
    super(`Invalid state for import plan.`, options)
    this.name = 'InvalidImportPlanStateError'
  }
}

class Projects {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<ProjectResponse>>('/next/projects')
  }

  /**
   * @throws {ProjectNotFoundError} If the project does not exist.
   */
  async get (logicalId: string) {
    try {
      const logicalIdParam = encodeURIComponent(logicalId)
      return await this.api.get<ProjectResponse>(`/next/projects/${logicalIdParam}`)
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new ProjectNotFoundError(logicalId)
      }

      throw err
    }
  }

  /**
   * @throws {ProjectAlreadyExistsError} If the project already exists.
   */
  async create (project: Project) {
    try {
      return await this.api.post('/next/projects', project)
    } catch (err) {
      if (err instanceof ConflictError) {
        throw new ProjectAlreadyExistsError(project.logicalId)
      }

      throw err
    }
  }

  /**
   * @throws {ProjectNotFoundError} If the project does not exist.
   */
  async deleteProject (logicalId: string, { preserveResources = false } = {}) {
    try {
      const logicalIdParam = encodeURIComponent(logicalId)
      return await this.api.delete(`/next/projects/${logicalIdParam}`, {
        params: { preserveResources },
      })
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new ProjectNotFoundError(logicalId)
      }

      throw err
    }
  }

  /**
   * Deploy a project. The deployment runs asynchronously on the backend: this
   * submits it, then follows its progress stream to completion, so large projects
   * are no longer bound by the API gateway request timeout. A dry run returns the
   * preview diff synchronously without starting a deployment.
   *
   * @throws {ProjectDeployFailedError} If the deployment finishes unsuccessfully.
   */
  async deploy (
    resources: ProjectSync,
    { dryRun = false, scheduleOnDeploy = true, cancelInProgress = false, onProgress, onStatus }: {
      dryRun?: boolean
      scheduleOnDeploy?: boolean
      /**
       * On a 409 (another deployment is already in progress), cancel that
       * deployment and retry instead of failing.
       */
      cancelInProgress?: boolean
      onProgress?: (progress: number) => void
      /** Human-readable status updates (e.g. while waiting on a predecessor). */
      onStatus?: (message: string) => void
    } = {},
  ): Promise<{ data: ProjectDeployResponse }> {
    const logicalId = resources.project.logicalId

    // A freed slot can be taken by a third party between our cancel and retry,
    // yielding a fresh 409 for a different deployment, so cancel→wait→retry may
    // repeat. Bound it to avoid an unbounded cancel war.
    const MAX_CANCEL_ATTEMPTS = 5
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.submitDeployment(resources, { dryRun, scheduleOnDeploy, onProgress })
      } catch (err) {
        if (
          !cancelInProgress
          || dryRun
          || !(err instanceof ConflictError)
          || typeof err.data.deploymentId !== 'string'
          || attempt >= MAX_CANCEL_ATTEMPTS
        ) {
          throw err
        }
        // Cancel the specific in-flight deployment we collided with, wait for it
        // to finish unwinding, then retry our deploy.
        await this.cancelInProgressDeployment(logicalId, err.data.deploymentId, onStatus)
      }
    }
  }

  private async submitDeployment (
    resources: ProjectSync,
    { dryRun, scheduleOnDeploy, onProgress }: {
      dryRun: boolean
      scheduleOnDeploy: boolean
      onProgress?: (progress: number) => void
    },
  ): Promise<{ data: ProjectDeployResponse }> {
    const { data } = await this.api.post<ProjectDeployResponse | ProjectDeployment>(
      `/v1/projects/deploy?dryRun=${dryRun}&scheduleOnDeploy=${scheduleOnDeploy}`,
      resources,
      { transformRequest: compressJSONPayload },
    )

    // A dry run responds synchronously with the preview diff.
    if (dryRun) {
      return { data: data as ProjectDeployResponse }
    }

    // A real deploy responds with a deployment to follow to completion.
    const deployment = data as ProjectDeployment
    const completed = await this.streamDeploymentEvents(resources.project.logicalId, deployment.id, { onProgress })

    if (completed.status !== 'SUCCEEDED' || completed.result === null) {
      throw new ProjectDeployFailedError(completed.error?.message ?? 'The deployment did not complete successfully.')
    }

    return { data: completed.result }
  }

  /**
   * Cancel an in-flight deployment and wait for it to reach a final state, so a
   * fresh deploy can take its slot. The predecessor's rollback can briefly hold
   * row locks, so we wait for it to be fully final before returning.
   */
  private async cancelInProgressDeployment (
    logicalId: string,
    deploymentId: string,
    onStatus?: (message: string) => void,
  ): Promise<void> {
    onStatus?.('Waiting for an in-progress deployment to finish before deploying…')
    try {
      await this.cancelDeployment(logicalId, deploymentId)
      await this.awaitDeploymentCompletion(logicalId, deploymentId)
    } catch (err) {
      // The predecessor no longer exists (it finished and was cleaned up between
      // our collision and now): its slot is free, so just proceed to retry.
      if (!(err instanceof NotFoundError)) {
        throw err
      }
    }
  }

  getDeployment (logicalId: string, deploymentId: string) {
    return this.api.get<ProjectDeployment>(
      `/v1/projects/${encodeURIComponent(logicalId)}/deployments/${encodeURIComponent(deploymentId)}`,
    )
  }

  /** Request cancellation of an in-flight deployment (idempotent on the server). */
  cancelDeployment (logicalId: string, deploymentId: string) {
    return this.api.post<ProjectDeployment>(
      `/v1/projects/${encodeURIComponent(logicalId)}/deployments/${encodeURIComponent(deploymentId)}/cancel`,
    )
  }

  /**
   * Long-poll the completion endpoint until the deployment reaches a final state,
   * returning it. The server blocks up to `maxWaitSeconds` and returns 408 when
   * that elapses (the deployment is still running); we keep calling until a final
   * state or the overall `deadlineMs` is hit.
   */
  async awaitDeploymentCompletion (
    logicalId: string,
    deploymentId: string,
    { maxWaitSeconds = 30, deadlineMs = 5 * 60_000, minPollIntervalMs = 1_000 }:
    { maxWaitSeconds?: number, deadlineMs?: number, minPollIntervalMs?: number } = {},
  ): Promise<ProjectDeployment> {
    const startedAt = Date.now()
    for (;;) {
      try {
        const { data } = await this.api.get<ProjectDeployment>(
          `/v1/projects/${encodeURIComponent(logicalId)}/deployments/${encodeURIComponent(deploymentId)}/completion`,
          { params: { maxWaitSeconds } },
        )
        return data
      } catch (err) {
        // 408 = still running after the server-side wait window; keep waiting.
        if (err instanceof RequestTimeoutError && Date.now() - startedAt < deadlineMs) {
          // Floor the cadence so a server that returns 408 immediately (rather
          // than long-polling for maxWaitSeconds) can't become a tight loop.
          await sleep(minPollIntervalMs)
          continue
        }
        throw err
      }
    }
  }

  /**
   * Follow a deployment to completion over its Server-Sent Events stream,
   * invoking `onProgress` as progress frames arrive and resolving with the final
   * deployment on the terminal `complete` frame. If the stream drops before a
   * terminal frame (a transient network blip), it reconnects up to `maxReconnects`
   * times — the server is stateless and re-reads current state, so resuming needs
   * no cursor.
   */
  async streamDeploymentEvents (
    logicalId: string,
    deploymentId: string,
    { onProgress, maxReconnects = 5 }: { onProgress?: (progress: number) => void, maxReconnects?: number } = {},
  ): Promise<ProjectDeployment> {
    let reconnects = 0
    for (;;) {
      try {
        return await this.consumeEventStream(logicalId, deploymentId, onProgress)
      } catch (err) {
        if (err instanceof DeploymentStreamInterruptedError && reconnects < maxReconnects) {
          reconnects += 1
          continue
        }
        throw err
      }
    }
  }

  private async openEventStream (logicalId: string, deploymentId: string): Promise<Readable> {
    try {
      const { data } = await this.api.get<Readable>(
        `/v1/projects/${encodeURIComponent(logicalId)}/deployments/${encodeURIComponent(deploymentId)}/events`,
        { responseType: 'stream', headers: { Accept: 'text/event-stream' } },
      )
      return data
    } catch (err) {
      // On an HTTP error the body arrives as an unparsed stream (responseType
      // 'stream'), so the response interceptor couldn't classify it. Buffer it and
      // re-run the classifier to surface the typed error (NotFoundError, etc.).
      if (isAxiosError(err) && err.response && err.response.data instanceof Readable) {
        err.response.data = await streamToString(err.response.data)
        handleErrorResponse(err)
      }
      throw err
    }
  }

  private async consumeEventStream (
    logicalId: string,
    deploymentId: string,
    onProgress?: (progress: number) => void,
  ): Promise<ProjectDeployment> {
    const stream = await this.openEventStream(logicalId, deploymentId)

    return new Promise<ProjectDeployment>((resolve, reject) => {
      let buffer = ''
      let settled = false
      const settle = (action: () => void) => {
        if (settled) {
          return
        }
        settled = true
        stream.destroy()
        action()
      }

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const frame = parseSseFrame(buffer.slice(0, boundary))
          buffer = buffer.slice(boundary + 2)
          if (frame?.event === 'progress') {
            if (onProgress !== undefined && typeof frame.data?.progress === 'number') {
              onProgress(frame.data.progress)
            }
          } else if (frame?.event === 'complete') {
            settle(() => resolve(frame.data as ProjectDeployment))
          } else if (frame?.event === 'error') {
            const message = typeof frame.data?.message === 'string'
              ? frame.data.message
              : 'The deployment event stream reported an error.'
            settle(() => reject(new ProjectDeployFailedError(message)))
          }
          boundary = buffer.indexOf('\n\n')
        }
      })
      // Both a clean EOF before a terminal frame and a socket error (the common
      // mid-deploy drop, e.g. ECONNRESET) are interruptions eligible for reconnect.
      stream.on('end', () => settle(() => reject(new DeploymentStreamInterruptedError())))
      stream.on('error', () => settle(() => reject(new DeploymentStreamInterruptedError())))
    })
  }

  /**
   * @throws {ProjectNotFoundError} If the project does not exist.
   * @throws {NoImportableResourcesFoundError} If no importable resources were found.
   */
  async createImportPlan (logicalId: string, options?: ImportPlanOptions) {
    const payload = {
      filters: options?.filters,
      friends: options?.friends,
    }
    try {
      const logicalIdParam = encodeURIComponent(logicalId)
      return await this.api.post<ImportPlan>(`/next/projects/${logicalIdParam}/imports`, payload, {
        params: {
          preview: options?.preview ?? false,
        },
      })
    } catch (err) {
      if (err instanceof NotFoundError) {
        if (/No importable resources were found/i.test(err.data.message)) {
          throw new NoImportableResourcesFoundError()
        }

        throw new ProjectNotFoundError(logicalId)
      }

      throw err
    }
  }

  /**
   * @throws {ProjectNotFoundError} If the project does not exist.
   */
  async findImportPlans (logicalId: string, { onlyUnapplied = false, onlyUncommitted = false } = {}) {
    try {
      const logicalIdParam = encodeURIComponent(logicalId)
      return await this.api.get<ImportPlan[]>(`/next/projects/${logicalIdParam}/imports`, {
        params: {
          onlyUnapplied,
          onlyUncommitted,
        },
      })
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new ProjectNotFoundError(logicalId)
      }

      throw err
    }
  }

  listImportPlans ({ onlyUnapplied = false, onlyUncommitted = false } = {}) {
    return this.api.get<ImportPlan[]>('/next/projects/imports', {
      params: {
        onlyUnapplied,
        onlyUncommitted,
      },
    })
  }

  /**
   * @throws {ImportPlanNotFoundError} If the import plan does not exist.
   * @throws {InvalidImportPlanStateError} If the operation is performed out of order.
   */
  async cancelImportPlan (importPlanId: string) {
    try {
      return await this.api.delete<void>(`/next/projects/imports/${importPlanId}`)
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new InvalidImportPlanStateError()
      }

      if (err instanceof NotFoundError) {
        throw new ImportPlanNotFoundError()
      }

      throw err
    }
  }

  /**
   * @throws {ImportPlanNotFoundError} If the import plan does not exist.
   * @throws {InvalidImportPlanStateError} If the operation is performed out of order.
   */
  async applyImportPlan (importPlanId: string) {
    try {
      return await this.api.post<void>(`/next/projects/imports/${importPlanId}/apply`)
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new InvalidImportPlanStateError()
      }

      if (err instanceof NotFoundError) {
        throw new ImportPlanNotFoundError()
      }

      throw err
    }
  }

  /**
   * @throws {ImportPlanNotFoundError} If the import plan does not exist.
   * @throws {InvalidImportPlanStateError} If the operation is performed out of order.
   */
  async commitImportPlan (importPlanId: string) {
    try {
      return await this.api.post<void>(`/next/projects/imports/${importPlanId}/commit`)
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new InvalidImportPlanStateError()
      }

      if (err instanceof NotFoundError) {
        throw new ImportPlanNotFoundError()
      }

      throw err
    }
  }
}

export default Projects
