import type { AxiosInstance } from 'axios'

const PATH = 'accounts'

export interface Account {
  id: string
  name: string
}

class Accounts {
  api: AxiosInstance
  apiVersion: string
  constructor (api: AxiosInstance, apiVersion = 'next') {
    this.api = api
    this.apiVersion = apiVersion
  }

  getAll () {
    return this.api.get<Array<Account>>(`/${this.apiVersion}/${PATH}`)
  }
}

export default Accounts
