import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../cli-mode', () => ({
  detectCliMode: vi.fn(() => 'interactive'),
}))

import { detectCliMode } from '../cli-mode.js'
import { ImportPlan } from '../../rest/projects.js'
import { PlanSelectionError, resolvePlanNonInteractively } from '../import-plan-selection.js'

function plan (id: string): ImportPlan {
  return { id, createdAt: new Date(0).toISOString() }
}

describe('resolvePlanNonInteractively', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('interactive')
  })

  it('selects the plan matching --plan-id regardless of mode', () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    const plans = [plan('a'), plan('b')]

    expect(resolvePlanNonInteractively(plans, 'b', 'apply')).toBe(plans[1])
  })

  it('throws PlanSelectionError when --plan-id does not match', () => {
    const plans = [plan('a'), plan('b')]

    expect(() => resolvePlanNonInteractively(plans, 'missing', 'commit'))
      .toThrowError(PlanSelectionError)
    expect(() => resolvePlanNonInteractively(plans, 'missing', 'commit'))
      .toThrowError(/with ID "missing"/)
  })

  it('returns undefined in interactive mode without --plan-id (falls back to prompt)', () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')

    expect(resolvePlanNonInteractively([plan('a'), plan('b')], undefined, 'apply'))
      .toBeUndefined()
  })

  it('auto-selects the single candidate in a non-interactive session', () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const plans = [plan('only')]

    expect(resolvePlanNonInteractively(plans, undefined, 'apply')).toBe(plans[0])
  })

  it('auto-selects the single candidate in CI mode too', () => {
    vi.mocked(detectCliMode).mockReturnValue('ci')
    const plans = [plan('only')]

    expect(resolvePlanNonInteractively(plans, undefined, 'cancel')).toBe(plans[0])
  })

  it('throws when non-interactive and multiple candidates are ambiguous', () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const plans = [plan('a'), plan('b')]

    expect(() => resolvePlanNonInteractively(plans, undefined, 'apply'))
      .toThrowError(PlanSelectionError)
    expect(() => resolvePlanNonInteractively(plans, undefined, 'apply'))
      .toThrowError(/--plan-id/)
  })
})
