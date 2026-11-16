// Each type-only form names its own target file. types.ts, reexported-types.ts and
// all-types.ts are identical on purpose: when a form is followed, the file that shows up
// in the bundle names that form.
import type { Plan } from './types.js'
import { type Limit } from './inline-type.js'
import { formatPlan } from './dep.js'
export type { Account } from './reexported-types.js'
export type * from './all-types.js'

export const label = (plan: Plan, limit: Limit) => formatPlan(plan, limit)
