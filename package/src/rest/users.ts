import type { AxiosInstance } from 'axios'

export interface User {
  id: string
  name: string
  nickname?: string
}

class Users {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  get () {
    return this.api.get<User>('/next/users/me')
  }
}

export default Users
