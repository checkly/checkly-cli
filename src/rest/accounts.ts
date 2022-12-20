import type { AxiosInstance } from 'axios'

const PATH = 'accounts'

export interface Account {
  id: string
  name: string
}

class Accounts {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<Array<Account>>(`/next/${PATH}`)
  }

  get (accountId: string) {
    return this.api.get<Account>(`/next/${PATH}/${accountId}`)
  }
}

export default Accounts
