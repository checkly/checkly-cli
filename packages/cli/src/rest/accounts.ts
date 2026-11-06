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
  /**
   * Client-visible account feature flags. Absent when the API predates them,
   * in which case standard limits apply.
   */
  features?: string[]
  /**
   * Every integration type the API reports, each marked connected or not, e.g.
   * `SLACK` for the Checkly Slack app. A type missing from the list is one the
   * API does not report. Absent when the API predates it.
   */
  integrations?: AccountIntegration[]
}

export interface AccountIntegration {
  type: string
  connected: boolean
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
