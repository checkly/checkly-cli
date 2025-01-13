import type { AxiosInstance } from 'axios'

export interface Account {
  id: string
  name: string
  runtimeId: string
}

class Accounts {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<Account>>('/next/accounts')
  }

  get (accountId: string) {
    return this.api.get<Account>(`/next/accounts/${accountId}`)
  }
}

export default Accounts
