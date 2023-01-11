import type { AxiosInstance } from 'axios'

interface PrivateLocation {
  slugName: string,
  id: string,
}

export default class PrivateLocations {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<PrivateLocation>>('/v1/private-locations')
  }
}
