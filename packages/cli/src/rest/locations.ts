import type { AxiosInstance } from 'axios'

export interface Location {
  name: string
  region: string
}

class Locations {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<Location>>('/v1/locations')
  }
}

export default Locations
