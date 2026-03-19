import type { AxiosInstance } from 'axios'

export interface AddonTier {
  tier: string
  tierDisplayName: string
}

export interface Account {
  id: string
  name: string
  runtimeId: string
  plan?: string
  planDisplayName?: string
  addons?: Record<string, AddonTier>
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
