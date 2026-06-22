import { type AxiosInstance } from 'axios'
import type { GitInformation } from '../services/util.js'
import { compressJSONPayload } from './util.js'
import { SharedFile } from '../constructs/index.js'
import { ConflictError, ForbiddenError, NotFoundError, RequestTimeoutError } from './errors.js'

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
}

export class ProjectDeployFailedError extends Error {
  constructor (message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectDeployFailedError'
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
   * submits it, then polls to completion so large projects are no longer bound
   * by the API gateway request timeout. A dry run returns the preview diff
   * synchronously without starting a deployment.
   *
   * @throws {ProjectDeployFailedError} If the deployment finishes unsuccessfully.
   */
  async deploy (
    resources: ProjectSync,
    { dryRun = false, scheduleOnDeploy = true, onProgress }: {
      dryRun?: boolean
      scheduleOnDeploy?: boolean
      onProgress?: (progress: number) => void
    } = {},
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
    const completed = await this.awaitDeploymentCompletion(deployment.id, { onProgress })

    if (completed.status !== 'SUCCEEDED' || completed.result === null) {
      throw new ProjectDeployFailedError(completed.error?.message ?? 'The deployment did not complete successfully.')
    }

    return { data: completed.result }
  }

  getDeployment (deploymentId: string) {
    return this.api.get<ProjectDeployment>(`/v1/projects/deployments/${encodeURIComponent(deploymentId)}`)
  }

  /**
   * Poll the completion endpoint until the deployment reaches a final state. The
   * endpoint waits up to maxWaitSeconds and then returns 408 (RequestTimeoutError);
   * we keep calling it until the deployment finishes.
   *
   * Termination: the loop ends when the deployment reaches a final state, or when
   * any non-408 error occurs — including the connection being lost (which surfaces
   * as MissingResponseError, not RequestTimeoutError). A reachable backend always
   * yields a final state because its reaper eventually finalizes a stuck deploy.
   *
   * While waiting, `onProgress` is invoked with the latest progress percentage
   * (best-effort: snapshot-fetch failures and absent progress are ignored).
   */
  async awaitDeploymentCompletion (
    deploymentId: string,
    { onProgress }: { onProgress?: (progress: number) => void } = {},
  ): Promise<ProjectDeployment> {
    const deploymentIdParam = encodeURIComponent(deploymentId)
    for (;;) {
      try {
        const { data } = await this.api.get<ProjectDeployment>(
          `/v1/projects/deployments/${deploymentIdParam}/completion?maxWaitSeconds=30`,
        )
        return data
      } catch (err) {
        if (!(err instanceof RequestTimeoutError)) {
          throw err
        }
        // Still in progress. Surface progress (best-effort) and keep waiting.
        if (onProgress !== undefined) {
          try {
            const { data } = await this.getDeployment(deploymentId)
            if (typeof data.progress === 'number') {
              onProgress(data.progress)
            }
          } catch {
            // Ignore progress-fetch failures; the next completion poll retries.
          }
        }
      }
    }
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
