import { RestResource } from './rest-resource.js'

export interface User {
  id: string
  name: string
  nickname?: string
}

class Users extends RestResource {
  get () {
    return this.api.get<User>('/next/users/me')
  }
}

export default Users
