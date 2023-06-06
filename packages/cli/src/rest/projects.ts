import type { AxiosInstance } from 'axios'
import type { GitInformation } from '../services/util'

export interface Project {
  name: string
  logicalId: string
  repoUrl?: string
}

type ProjectResponse = Project & { id: string, created_at: string }

export interface Change {
  logicalId: string,
  physicalId?: string,
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
  repoInfo: GitInformation|null,
  resources: Array<ResourceSync>
}

export interface ProjectDeployResponse {
  project: Project
  diff: Array<Change>
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

  deploy (resources: ProjectSync, { dryRun = false } = {}) {
    return this.api.post<ProjectDeployResponse>(
      `/next-v2/projects/deploy?dryRun=${dryRun}`,
      resources,
    )
  }
}

export default Projects
