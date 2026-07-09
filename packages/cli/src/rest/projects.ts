import { type AxiosInstance, isAxiosError } from 'axios'
import { Readable } from 'node:stream'
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

// The project echoed back in a deploy result: identity fields + timestamps. The
// timestamps are camelCase to match the deployment envelope (the project CRUD
// endpoints return snake_case — see ProjectResponse).
export interface DeployedProject extends Project {
  id: string
  createdAt: string
  updatedAt: string | null
}

export interface ProjectDeployResponse {
  project: DeployedProject
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

/** The deployment was cancelled before it finished (e.g. superseded by a newer deploy). */
export class ProjectDeployCancelledError extends Error {
  constructor (message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectDeployCancelledError'
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

// How long deploy() and deleteProject() will keep waiting-and-retrying behind an
// in-progress operation before giving up and surfacing the 409. Generous, since a
// large predecessor deploy or delete can legitimately run for many minutes.
const DEPLOY_CONFLICT_WAIT_DEADLINE_MS = 30 * 60_000

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
   * Delete a project. The deletion runs asynchronously on the backend: this
   * submits it, then follows its progress stream to completion, so large projects
   * are no longer bound by the API gateway request timeout. A project that does
   * not exist is treated as already deleted (the endpoint is idempotent).
   *
   * @throws {ProjectDeployFailedError} If the deletion finishes unsuccessfully.
   */
  async deleteProject (
    logicalId: string,
    { preserveResources = false, cancelInProgress = false, onProgress, onStatus }: {
      preserveResources?: boolean
      /**
       * On a 409 (a deploy or delete is already in progress), cancel that
       * operation instead of waiting for it to finish, then retry.
       */
      cancelInProgress?: boolean
      onProgress?: (progress: number) => void
      /** Human-readable status updates (e.g. while waiting on a predecessor). */
      onStatus?: (message: string) => void
    } = {},
  ): Promise<void> {
    // On a 409 the project already has an operation (deploy or delete) in
    // progress. By default we wait for it to reach a final state then retry; with
    // cancelInProgress we cancel it first. Bounded by an overall deadline so a
    // stuck predecessor can't make us wait forever.
    const deadlineAt = Date.now() + DEPLOY_CONFLICT_WAIT_DEADLINE_MS
    for (;;) {
      try {
        await this.submitDeletion(logicalId, { preserveResources, onProgress })
        return
      } catch (err) {
        if (
          !(err instanceof ConflictError)
          || typeof err.data.deploymentId !== 'string'
          || Date.now() >= deadlineAt
        ) {
          throw err
        }
        await this.resolveInProgressDeployment(logicalId, err.data.deploymentId, {
          cancel: cancelInProgress,
          onStatus,
          deadlineAt,
        })
        // loop → re-submit, now that the predecessor has reached a final state
      }
    }
  }

  /**
   * Submit the async delete and follow it to completion. The endpoint responds
   * either with a deployment to follow (202), or — when there is nothing to delete
   * (the project does not exist) — a plain result with no deployment to follow.
   */
  private async submitDeletion (
    logicalId: string,
    { preserveResources, onProgress }: { preserveResources: boolean, onProgress?: (progress: number) => void },
  ): Promise<void> {
    const { data } = await this.api.delete<ProjectDeployResponse | ProjectDeployment>(
      `/v1/projects/${encodeURIComponent(logicalId)}`,
      { params: { preserveResources, dryRun: false } },
    )

    // A missing project completes synchronously with a plain result body and no
    // deployment to follow — already deleted (idempotent).
    if (!('status' in data)) {
      return
    }

    const completed = await this.streamDeploymentEvents(logicalId, data.id, { onProgress })

    if (completed.status === 'CANCELLED') {
      throw new ProjectDeployCancelledError(
        'The deletion was cancelled before it finished. A newer operation may have superseded it.',
      )
    }

    if (completed.status !== 'SUCCEEDED') {
      throw new ProjectDeployFailedError(completed.error?.message ?? 'The deletion did not complete successfully.')
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
    {
      dryRun = false,
      scheduleOnDeploy = true,
      preserveResources = false,
      cancelInProgress = false,
      onProgress,
      onStatus,
    }: {
      dryRun?: boolean
      scheduleOnDeploy?: boolean
      /**
       * Detach resources removed from code (keep them and their run history)
       * instead of deleting them.
       */
      preserveResources?: boolean
      /**
       * On a 409 (another deployment is already in progress), cancel that
       * deployment instead of waiting for it to finish, then retry.
       */
      cancelInProgress?: boolean
      onProgress?: (progress: number) => void
      /** Human-readable status updates (e.g. while waiting on a predecessor). */
      onStatus?: (message: string) => void
    } = {},
  ): Promise<{ data: ProjectDeployResponse }> {
    const logicalId = resources.project.logicalId

    // On a 409 the project already has a deployment in progress. By default we
    // wait for it to finish then retry; with cancelInProgress we cancel it first.
    // resolveInProgressDeployment only returns once the predecessor has reached a
    // final state, so we re-POST the (potentially large) payload exactly once per
    // predecessor — never while it is still running. Bound by an overall deadline
    // so a stuck predecessor can't make us wait forever.
    const deadlineAt = Date.now() + DEPLOY_CONFLICT_WAIT_DEADLINE_MS
    for (;;) {
      try {
        return await this.submitDeployment(resources, { dryRun, scheduleOnDeploy, preserveResources, onProgress })
      } catch (err) {
        if (
          dryRun
          || !(err instanceof ConflictError)
          || typeof err.data.deploymentId !== 'string'
          || Date.now() >= deadlineAt
        ) {
          throw err
        }
        await this.resolveInProgressDeployment(logicalId, err.data.deploymentId, {
          cancel: cancelInProgress,
          onStatus,
          deadlineAt,
        })
        // loop → re-POST, now that the predecessor has reached a final state
      }
    }
  }

  private async submitDeployment (
    resources: ProjectSync,
    { dryRun, scheduleOnDeploy, preserveResources, onProgress }: {
      dryRun: boolean
      scheduleOnDeploy: boolean
      preserveResources: boolean
      onProgress?: (progress: number) => void
    },
  ): Promise<{ data: ProjectDeployResponse }> {
    // Only send preserveResources when the user opted in. The endpoint rejects
    // unknown query params, and preserveResources=false is the default (delete)
    // behavior, so omitting it keeps default deploys backwards compatible.
    const preserveParam = preserveResources ? '&preserveResources=true' : ''
    const { data } = await this.api.post<ProjectDeployResponse | ProjectDeployment>(
      `/v1/projects/deploy?dryRun=${dryRun}&scheduleOnDeploy=${scheduleOnDeploy}${preserveParam}`,
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

    if (completed.status === 'CANCELLED') {
      throw new ProjectDeployCancelledError(
        'A newer deployment may have cancelled yours. Try deploying again if you still need to apply your changes.',
      )
    }

    if (completed.status !== 'SUCCEEDED' || completed.result === null) {
      throw new ProjectDeployFailedError(completed.error?.message ?? 'The deployment did not complete successfully.')
    }

    return { data: completed.result }
  }

  /**
   * Resolve a collision with an in-progress deployment so the caller can retry:
   * optionally cancel it, then wait until it reaches a final state (or is gone)
   * before returning — so the caller re-POSTs only when the slot is actually
   * free, never re-uploading the payload while the predecessor is still running.
   * Returns early if the overall `deadlineAt` passes (the caller then re-POSTs
   * once and surfaces the conflict).
   */
  private async resolveInProgressDeployment (
    logicalId: string,
    deploymentId: string,
    { cancel, onStatus, deadlineAt }: { cancel: boolean, onStatus?: (message: string) => void, deadlineAt: number },
  ): Promise<void> {
    if (cancel) {
      onStatus?.('Cancelling an in-progress deployment...')
      try {
        await this.cancelDeployment(logicalId, deploymentId)
      } catch (err) {
        // Already gone → nothing to cancel; proceed to retry.
        if (!(err instanceof NotFoundError)) {
          throw err
        }
        return
      }
    } else {
      onStatus?.('Waiting for an in-progress deployment to finish...')
    }

    // Poll the completion endpoint until the predecessor is final. Pacing comes
    // from the server-side long-poll (~maxWaitSeconds per call), so this is not a
    // busy loop; the deadline bounds the total wait.
    for (;;) {
      try {
        await this.awaitDeploymentCompletion(logicalId, deploymentId)
        return // reached a final state → slot free
      } catch (err) {
        if (err instanceof NotFoundError) {
          return // gone → slot free
        }
        // 408 = still running after the long-poll window. Keep waiting unless the
        // overall deadline has passed, in which case return and let the caller
        // re-POST once and surface the conflict.
        if (err instanceof RequestTimeoutError) {
          if (Date.now() >= deadlineAt) {
            return
          }
          continue
        }
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
   * Long-poll the completion endpoint once: the server blocks up to
   * `maxWaitSeconds` and returns the deployment when it reaches a final state, or
   * 408 (`RequestTimeoutError`) if it is still running when that window elapses.
   * The retry cadence lives in the caller, not here.
   */
  async awaitDeploymentCompletion (
    logicalId: string,
    deploymentId: string,
    { maxWaitSeconds = 30 }: { maxWaitSeconds?: number } = {},
  ): Promise<ProjectDeployment> {
    const { data } = await this.api.get<ProjectDeployment>(
      `/v1/projects/${encodeURIComponent(logicalId)}/deployments/${encodeURIComponent(deploymentId)}/completion`,
      { params: { maxWaitSeconds } },
    )
    return data
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
