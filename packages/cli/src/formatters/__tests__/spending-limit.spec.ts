import { describe, expect, it } from 'vitest'
import { stripAnsi } from '../render.js'
import { formatDollars, formatSpendingLimit } from '../spending-limit.js'
import type { SpendingLimit } from '../../rest/spending-limit.js'

const closeToLimit: SpendingLimit = {
  spendingCapCents: 3000,
  standing: {
    measuredAt: '2099-11-15T00:00:00.000Z',
    pools: {
      API: { used: 17230, included: 100000, overageRuns: 0, overageCents: 0 },
      BROWSER: { used: 14890, included: 12000, overageRuns: 2890, overageCents: 1806.25 },
    },
    overageCents: 1806.25,
    limit: { capCents: 3000, state: 'CLOSE', closeAtCents: 2400 },
  },
}

describe('formatDollars', () => {
  it('formats cents as dollars, rounding fractional cents', () => {
    expect(formatDollars(1806.25)).toBe('$18.06')
    expect(formatDollars(0)).toBe('$0.00')
    expect(formatDollars(1000000)).toBe('$10,000.00')
  })
})

describe('formatSpendingLimit', () => {
  it('shows the limit, overage, status and measurement time', () => {
    const out = stripAnsi(formatSpendingLimit(closeToLimit, 'terminal'))
    expect(out).toMatch(/Spending limit:\s+\$30\.00/)
    expect(out).toMatch(/Overage so far:\s+\$18\.06/)
    expect(out).toMatch(/Status:\s+Close to the limit \(from \$24\.00\)/)
    expect(out).toMatch(/Checks stopped:\s+No/)
    expect(out).toMatch(/Measured at:\s+2099-11-15 00:00:00 UTC/)
  })

  it('says checks are stopped when the limit is reached', () => {
    const reached: SpendingLimit = {
      ...closeToLimit,
      standing: { ...closeToLimit.standing!, limit: { capCents: 3000, state: 'REACHED', closeAtCents: 2400 } },
    }
    expect(stripAnsi(formatSpendingLimit(reached, 'terminal'))).toMatch(/Checks stopped:\s+Yes/)
  })

  it('never shows $0 overage when nothing is measured', () => {
    const out = formatSpendingLimit({ spendingCapCents: null, standing: null }, 'md')
    expect(out).toContain('| Spending limit | No limit |')
    expect(out).toContain('| Overage so far | Not measured')
    expect(out).not.toContain('$0')
    expect(out).not.toContain('Checks stopped')
  })

  it('labels a $0 limit and omits the status without a limit', () => {
    const out = formatSpendingLimit({
      spendingCapCents: 0,
      standing: { ...closeToLimit.standing!, overageCents: 0, limit: null },
    }, 'md')
    expect(out).toContain('| Spending limit | $0.00 (no overage allowed) |')
    expect(out).toContain('| Overage so far | $0.00 |')
    expect(out).not.toContain('| Status |')
  })
})
