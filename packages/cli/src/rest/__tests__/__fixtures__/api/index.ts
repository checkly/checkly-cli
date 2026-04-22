import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Check } from '../../../checks'
import type { CheckStatus } from '../../../check-statuses'

const dir = path.dirname(fileURLToPath(import.meta.url))

export const allChecks = JSON.parse(
  readFileSync(path.join(dir, 'checks.json'), 'utf8'),
) as Check[]

export const allStatuses = JSON.parse(
  readFileSync(path.join(dir, 'check-statuses.json'), 'utf8'),
) as CheckStatus[]

export type ScenarioName =
  | 'mixed'
  | 'all-passing'
  | 'all-deactivated'
  | 'active-no-statuses'
  | 'empty'

export interface Scenario {
  checks: Check[]
  statuses: CheckStatus[]
}

// Slices the canonical mixed fixture into scenario-specific subsets.
// For edge cases not present in real data (pure hasErrors, deactivated+failing),
// mutate the returned objects in the individual test that needs them.
export function scenario (name: ScenarioName): Scenario {
  switch (name) {
    case 'mixed':
      return { checks: allChecks, statuses: allStatuses }
    case 'all-passing': {
      const ids = new Set(['check-001', 'check-002', 'check-003', 'check-004', 'check-005', 'check-006'])
      return {
        checks: allChecks.filter(c => ids.has(c.id)),
        statuses: allStatuses.filter(s => ids.has(s.checkId)),
      }
    }
    case 'all-deactivated': {
      const ids = new Set(['check-015', 'check-016', 'check-017', 'check-018', 'check-019'])
      return {
        checks: allChecks.filter(c => ids.has(c.id)),
        statuses: allStatuses.filter(s => ids.has(s.checkId)),
      }
    }
    case 'active-no-statuses': {
      const ids = new Set(['check-013'])
      return {
        checks: allChecks.filter(c => ids.has(c.id)),
        statuses: [],
      }
    }
    case 'empty':
      return { checks: [], statuses: [] }
  }
}
