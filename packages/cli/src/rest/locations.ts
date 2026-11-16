import { RestResource } from './rest-resource.js'

export interface Location {
  name: string
  region: string
}

class Locations extends RestResource {
  getAll () {
    return this.api.get<Array<Location>>('/v1/locations')
  }
}

export default Locations
