import { describe, expect, it } from 'vitest'

import { valueForAlertEscalation } from '../alert-escalation-policy-codegen.js'
import { GeneratedFile, Output } from '../../sourcegen/index.js'

/**
 * The escalation builders take positional arguments (threshold, reminders,
 * parallel-run threshold), so a policy without reminders must still keep
 * the third argument in its place.
 */
function render (escalation: Parameters<typeof valueForAlertEscalation>[1]): string {
  const output = new Output()
  const file = new GeneratedFile('foo.ts')
  valueForAlertEscalation(file, escalation).render(output)
  return output.finalize()
}

describe('valueForAlertEscalation', () => {
  it('renders a run-based policy with its reminders and threshold', () => {
    const source = render({
      escalationType: 'RUN_BASED' as any,
      runBasedEscalation: { failedRunThreshold: 3 },
      reminders: { amount: 2, interval: 10 },
      parallelRunFailureThreshold: { enabled: true, percentage: 20 },
    })
    expect(source).toBe(`AlertEscalationBuilder.runBasedEscalation(3, {
  amount: 2,
  interval: 10,
}, {
  enabled: true,
  percentage: 20,
})
`)
  })

  it('renders a time-based policy with a threshold only', () => {
    expect(render({
      escalationType: 'TIME_BASED' as any,
      timeBasedEscalation: { minutesFailingThreshold: 10 },
    })).toBe('AlertEscalationBuilder.timeBasedEscalation(10)\n')
  })

  it('holds the reminders slot with undefined when only the parallel-run threshold is set', () => {
    const source = render({
      escalationType: 'RUN_BASED' as any,
      runBasedEscalation: { failedRunThreshold: 1 },
      parallelRunFailureThreshold: { enabled: false, percentage: 10 },
    })
    expect(source).toBe(`AlertEscalationBuilder.runBasedEscalation(1, undefined, {
  enabled: false,
  percentage: 10,
})
`)
  })

  it('fills in the builder default when the policy has no threshold, so later arguments keep their slot', () => {
    expect(render({
      escalationType: 'RUN_BASED' as any,
      reminders: { amount: 2, interval: 10 },
    })).toBe(`AlertEscalationBuilder.runBasedEscalation(1, {
  amount: 2,
  interval: 10,
})
`)
    expect(render({
      escalationType: 'TIME_BASED' as any,
      timeBasedEscalation: {},
    })).toBe('AlertEscalationBuilder.timeBasedEscalation(5)\n')
  })

  it('refuses an escalation type it does not know', () => {
    expect(() => render({ escalationType: 'OTHER' as any })).toThrow('Unsupported alert escalation type OTHER')
  })
})
