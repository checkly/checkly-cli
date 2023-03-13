import type { AxiosInstance } from 'axios'

export interface Project {
  name: string
  logicalId: string
  repoUrl?: string
}

type ProjectResponse = Project & { id: string, created_at: string }

export interface ProjectSync {
  project: Project,
  checks: Record<string, any>
  groups: Record<string, any>
  alertChannels: Record<string, any>
  alertChannelSubscriptions: Record<string, any>
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
    return this.api.post(
      `/next/projects/deploy?dryRun=${dryRun}`,
      resources,
    )
  }
}

export default Projects
