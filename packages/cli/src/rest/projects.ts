import { type AxiosInstance } from 'axios'
import type { GitInformation } from '../services/util'
import { compressJSONPayload } from './util'
import { SharedFile } from '../constructs'
import { ConflictError, ForbiddenError, NotFoundError } from './errors'

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
  async deleteProject (logicalId: string) {
    try {
      const logicalIdParam = encodeURIComponent(logicalId)
      return await this.api.delete(`/next/projects/${logicalIdParam}`)
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new ProjectNotFoundError(logicalId)
      }

      throw err
    }
  }

  deploy (resources: ProjectSync, { dryRun = false, scheduleOnDeploy = true } = {}) {
    return this.api.post<ProjectDeployResponse>(
      `/next-v2/projects/deploy?dryRun=${dryRun}&scheduleOnDeploy=${scheduleOnDeploy}`,
      resources,
      { transformRequest: compressJSONPayload },
    )
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
