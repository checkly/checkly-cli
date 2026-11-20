import { RestResource } from './rest-resource.js'

export type SpendingCapState = 'UNDER' | 'CLOSE' | 'REACHED'

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
  /** `null` when the account has no cap. */
  limit: { capCents: number, state: SpendingCapState, closeAtCents: number } | null
}

export interface SpendingCap {
  /** `null` = no cap; `0` = no overage allowed. */
  spendingCapCents: number | null
  /** `null` when nothing is judged (plan without overage, or runs not measured yet). Not $0 overage. */
  standing: SpendingStanding | null
}

class SpendingCaps extends RestResource {
  get () {
    return this.api.get<SpendingCap>('/v1/billing/spending-cap')
  }

  /** `null` removes the cap. */
  update (spendingCapCents: number | null) {
    return this.api.put<Pick<SpendingCap, 'spendingCapCents'>>('/v1/billing/spending-cap', { spendingCapCents })
  }
}

export default SpendingCaps
