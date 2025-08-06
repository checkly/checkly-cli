import type { AxiosInstance } from 'axios'

export interface PrivateLocationApi {
  id: string
  slugName: string
}

export default class PrivateLocations {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<PrivateLocationApi>>('/v1/private-locations')
  }
}
