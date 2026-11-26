import { RestResource } from './rest-resource.js'

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
   * Every integration type the API reports, e.g. `SLACK` or `PAGERDUTY`, with
   * whether it is connected to the account and whether the account's plan
   * includes it. A type missing from the list is one the API does not report.
   * Absent when the API predates it.
   */
  integrations?: AccountIntegration[]
}

export interface AccountIntegration {
  type: string
  /**
   * Whether the integration is connected to the account. Always true for an
   * integration that needs no per-account connection.
   */
  connected: boolean
  /**
   * Whether the account may use the integration. Absent when the API predates
   * it, in which case nothing is known about it.
   */
  entitled?: boolean
}

class Accounts extends RestResource {
  getAll () {
    return this.api.get<Array<Account>>('/next/accounts')
  }

  get (accountId: string) {
    return this.api.get<Account>(`/next/accounts/${accountId}`)
  }
}

export default Accounts
