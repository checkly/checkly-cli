import type { Plan } from './types.js'
import { type Limit } from './inline-type.js'
import { formatPlan } from './dep.js'
export type { Account } from './reexported-types.js'
export type * from './all-types.js'

export const label = (plan: Plan, limit: Limit) => formatPlan(plan, limit)
