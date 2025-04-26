import { isAxiosError, type AxiosInstance } from 'axios'
import type { GitInformation } from '../services/util'
import { compressJSONPayload } from './util'

export interface Project {
  name: string
  logicalId: string
  repoUrl?: string
}

type ProjectResponse = Project & { id: string, created_at: string }

export interface Change {
  logicalId: string,
  physicalId?: string|number,
  type: string,
  action: string
}

export interface ResourceSync {
  logicalId: string,
  physicalId?: string|number,
  type: string,
  member: boolean,
  payload: any,
}

export interface AuxiliaryResourceSync {
  physicalId?: string|number
  type: string
  payload: any
}

export interface ProjectSync {
  project: Project,
  resources: Array<ResourceSync>,
  repoInfo: GitInformation|null,
}

export interface ProjectDeployResponse {
  project: Project
  diff: Array<Change>
}

export interface ImportPlanChanges {
  resources: ResourceSync[]
  auxiliary?: AuxiliaryResourceSync[]
}

export interface ImportPlan {
  id: string
  createdAt: string
  appliedAt?: string
  committedAt?: string
  changes?: ImportPlanChanges
}

export class ProjectNotFoundError extends Error {}

class Projects {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<ProjectResponse>>('/next/projects')
  }

  async get (id: string) {
    try {
      return await this.api.get<ProjectResponse>(`/next/projects/${id}`)
    } catch (err) {
      if (isAxiosError(err)) {
        if (err.response?.status === 404) {
          throw new ProjectNotFoundError()
        }
      }

      throw err
    }
  }

  create (project: Project) {
    return this.api.post('/next/projects', project)
  }

  async deleteProject (logicalId: string) {
    try {
      return await this.api.delete(`/next/projects/${logicalId}`)
    } catch (err) {
      if (isAxiosError(err)) {
        if (err.response?.status === 404) {
          throw new ProjectNotFoundError()
        }
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

  createImportPlan (logicalId: string) {
    return this.api.post<ImportPlan>(`/next/projects/${logicalId}/imports`)
  }

  async findImportPlans (logicalId: string, { onlyUnapplied = false, onlyUncommitted = false } = {}) {
    try {
      return await this.api.get<ImportPlan[]>(`/next/projects/${logicalId}/imports`, {
        params: {
          onlyUnapplied,
          onlyUncommitted,
        },
      })
    } catch (err) {
      if (isAxiosError(err)) {
        if (err.response?.status === 404) {
          throw new ProjectNotFoundError()
        }
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

  cancelImportPlan (importPlanId: string) {
    return this.api.delete<void>(`/next/projects/imports/${importPlanId}`)
  }

  applyImportPlan (importPlanId: string) {
    return this.api.post<void>(`/next/projects/imports/${importPlanId}/apply`)
  }

  commitImportPlan (importPlanId: string) {
    return this.api.post<void>(`/next/projects/imports/${importPlanId}/commit`)
  }
}

export default Projects
