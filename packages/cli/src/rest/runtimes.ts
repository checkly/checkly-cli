import type { AxiosInstance } from 'axios'

export interface Runtime {
  name: string
  stage?: string
  runtimeEndOfLife?: string
  description?: string
  dependencies: Record<string, string>
  multiStepSupport?: boolean
}

class Runtimes {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<Runtime>>('/v1/runtimes')
  }

  get (runtimeId: string) {
    return this.api.get<Runtime>(`/v1/runtimes/${runtimeId}`)
  }
}

export default Runtimes
