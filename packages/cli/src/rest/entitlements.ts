import type { AxiosInstance } from 'axios'

export interface Addon {
  tier: string
  tierDisplayName: string
}

export interface RequiredAddon {
  name: string
  displayName: string
  tier: string
  tierDisplayName: string
}

export interface Entitlement {
  key: string
  name: string
  description: string
  type: 'metered' | 'flag'
  enabled: boolean
  quantity?: number
  requiredPlan?: string
  requiredPlanDisplayName?: string
  requiredAddon?: RequiredAddon
}

export interface Location {
  id: string
  name: string
  available: boolean
}

export interface AccountLocations {
  all: Location[]
  maxPerCheck: number
}

export interface AccountPlan {
  plan: string
  planDisplayName: string
  addons: {
    communicate?: Addon
    resolve?: Addon
  }
  locations?: AccountLocations
  entitlements: Entitlement[]
}

class Entitlements {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<AccountPlan>('/v1/accounts/me/entitlements')
  }
}

export default Entitlements
