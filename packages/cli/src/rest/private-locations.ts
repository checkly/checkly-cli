import { RestResource } from './rest-resource.js'

export interface PrivateLocationApi {
  id: string
  slugName: string
}

export default class PrivateLocations extends RestResource {
  getAll () {
    return this.api.get<Array<PrivateLocationApi>>('/v1/private-locations')
  }
}
