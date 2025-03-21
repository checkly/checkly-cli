import type { AxiosInstance } from 'axios'
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
  resources: ResourceSync
}

export interface ImportPlan {
  id: string
  createdAt: string
  appliedAt?: string
  committedAt?: string
  changes?: ImportPlanChanges
}

class Projects {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<ProjectResponse>>('/next/projects')
  }

  get (id: string) {
    return this.api.get<ProjectResponse>(`/next/projects/${id}`)
  }

  create (project: Project) {
    return this.api.post('/next/projects', project)
  }

  deleteProject (logicalId: string) {
    return this.api.delete(`/next/projects/${logicalId}`)
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

  findImportPlans (logicalId: string, { onlyUnapplied = false, onlyUncommitted = false } = {}) {
    return this.api.get<ImportPlan[]>(`/next/projects/${logicalId}/imports`, {
      params: {
        onlyUnapplied,
        onlyUncommitted,
      },
    })
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
