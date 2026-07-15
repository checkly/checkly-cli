import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../cli-mode', () => ({
  detectCliMode: vi.fn(() => 'interactive'),
}))

import { detectCliMode } from '../cli-mode.js'
import { ImportPlan } from '../../rest/projects.js'
import {
  PlanSelectionError,
  reportNoCandidatePlans,
  resolvePlanNonInteractively,
  validatePlanFlagsOrExit,
} from '../import-plan-selection.js'

function plan (id: string): ImportPlan {
  return { id, createdAt: new Date(0).toISOString() }
}

function createCommand () {
  return {
    log: vi.fn(),
    exit: vi.fn((code: number) => {
      throw new Error(`EXIT_${code}`)
    }),
    style: {
      fatal: vi.fn(),
    },
  } as any
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

  it('names the candidate plan IDs when the selection is ambiguous', () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    const plans = [plan('abc123'), plan('def456')]

    // There is no plan listing command, so an agent can only obtain the IDs it
    // is being asked to choose between from this message.
    expect(() => resolvePlanNonInteractively(plans, undefined, 'commit'))
      .toThrowError(/abc123/)
    expect(() => resolvePlanNonInteractively(plans, undefined, 'commit'))
      .toThrowError(/def456/)
  })
})

describe('validatePlanFlagsOrExit', () => {
  it('exits 1 when --all and --plan-id are combined', () => {
    const command = createCommand()

    expect(() => validatePlanFlagsOrExit(command, { all: true, planId: 'a' })).toThrow('EXIT_1')
    expect(command.style.fatal).toHaveBeenCalledWith(expect.stringContaining('cannot be used together'))
  })

  it.each([
    ['--all alone', { all: true, planId: undefined }],
    ['--plan-id alone', { all: false, planId: 'a' }],
    ['neither flag', { all: false, planId: undefined }],
  ])('accepts %s', (_name, flags) => {
    const command = createCommand()

    expect(() => validatePlanFlagsOrExit(command, flags)).not.toThrow()
    expect(command.style.fatal).not.toHaveBeenCalled()
  })
})

describe('reportNoCandidatePlans', () => {
  const options = { action: 'commit', nothingToDo: 'Nothing to commit.' }

  it('returns false and stays quiet when candidates exist', () => {
    const command = createCommand()

    expect(reportNoCandidatePlans(command, [plan('a')], options)).toBe(false)
    expect(command.log).not.toHaveBeenCalled()
    expect(command.style.fatal).not.toHaveBeenCalled()
  })

  it('exits 1 when an explicit --plan-id cannot be satisfied', () => {
    const command = createCommand()

    expect(() => reportNoCandidatePlans(command, [], { ...options, planId: 'abc123' })).toThrow('EXIT_1')
    expect(command.style.fatal).toHaveBeenCalledWith(expect.stringContaining('abc123'))
  })

  it('reports nothing-to-do without failing when no plan was requested', () => {
    const command = createCommand()

    expect(reportNoCandidatePlans(command, [], options)).toBe(true)
    expect(command.log).toHaveBeenCalledWith('Nothing to commit.')
    expect(command.exit).not.toHaveBeenCalled()
    expect(command.style.fatal).not.toHaveBeenCalled()
  })
})
