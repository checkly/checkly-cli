import { RestResource } from './rest-resource.js'

export interface CheckGroup {
  id: number
  name: string
  activated: boolean
  muted: boolean
  locations: string[]
  tags: string[]
  concurrency: number
}

class CheckGroups extends RestResource {
  getAll () {
    return this.api.get<CheckGroup[]>('/v1/check-groups')
  }
}

export default CheckGroups
