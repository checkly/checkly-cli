import { RestResource } from './rest-resource.js'

export type SpendingLimitState = 'UNDER' | 'CLOSE' | 'REACHED'

export interface SpendingPool {
  used: number
  included: number
  overageRuns: number
  overageCents: number
}

export interface SpendingStanding {
  measuredAt: string
  pools: Record<string, SpendingPool>
  /** Not rounded to whole cents. */
  overageCents: number
  /** `null` when the account has no limit. */
  limit: { capCents: number, state: SpendingLimitState, closeAtCents: number } | null
}

export interface SpendingLimit {
  /** `null` = no limit; `0` = no overage allowed. */
  spendingCapCents: number | null
  /** `null` when nothing is judged (plan without overage, or runs not measured yet). Not $0 overage. */
  standing: SpendingStanding | null
}

class SpendingLimits extends RestResource {
  get () {
    return this.api.get<SpendingLimit>('/v1/billing/spending-limit')
  }

  /** `null` removes the limit. */
  update (spendingCapCents: number | null) {
    return this.api.put<Pick<SpendingLimit, 'spendingCapCents'>>('/v1/billing/spending-limit', { spendingCapCents })
  }
}

export default SpendingLimits
