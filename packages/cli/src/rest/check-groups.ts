import type { AxiosInstance } from 'axios'

export interface CheckGroup {
  id: number
  name: string
  activated: boolean
  muted: boolean
  locations: string[]
  tags: string[]
  concurrency: number
}

class CheckGroups {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<CheckGroup[]>('/v1/check-groups')
  }
}

export default CheckGroups
