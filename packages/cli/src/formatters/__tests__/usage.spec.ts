import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UsageMetrics, UsageRow, UsageSummary, UsageTerms, UsageWarning } from '../../rest/usage.js'
import { stripAnsi, visWidth } from '../render.js'
import {
  aiInvocationMeasures,
  checkRunMeasures,
  formatUsageSeries,
  formatUsageSummary,
  formatUsageSeriesPaginationInfo,
  formatUsageSeriesNavigationHints,
  formatUsageTermsDetail,
  formatUsageWarnings,
} from '../usage.js'

const originalColumns = process.stdout.columns

beforeEach(() => {
  Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 350 })
})

afterEach(() => {
  Object.defineProperty(process.stdout, 'columns', { configurable: true, value: originalColumns })
})

export const termsFixture: UsageTerms = {
  id: '5c6f0a1e-7c4d-4a4f-9d6b-1e2f3a4b5c6d',
  name: 'Acme Corp',
  accounts: [
    { id: 'a1111111-1111-4111-8111-111111111111', name: 'Acme Production' },
    { id: 'b2222222-2222-4222-8222-222222222222', name: 'Acme Staging' },
  ],
  contractStartDate: '2026-01-01',
  contractEndDate: '2026-12-31',
  usageStartDate: '2026-01-01',
  creditBudget: 1000,
  standardCreditsPerUnit: 2,
  premiumCreditsPerUnit: 3,
}

export function metricsFixture (overrides: Partial<UsageMetrics['credits']> = {}): UsageMetrics {
  return {
    credits: { used: 45, percentOfBudget: 4.5, ...overrides },
    meters: [
      {
        meterType: 'CHECK_RUN',
        measures: {
          totalRuns: 11,
          finalRuns: 10,
          retryRuns: 1,
          cancelledRuns: 1,
          multiStepRequests: 9,
          playwrightBillableDurationMs: 90_000,
          degradedRuns: 1,
          failedRuns: 1,
          errorRuns: 1,
          abortedRuns: 1,
          overMaxResponseTimeRuns: 1,
          standardBillableUnits: 12,
          premiumBillableUnits: 7,
        },
      },
      { meterType: 'AI_INVOCATION', measures: { invocations: 3, durationMs: 1234 } },
    ],
  }
}

describe('meter accessors', () => {
  it('finds the CHECK_RUN and AI_INVOCATION meters', () => {
    expect(checkRunMeasures(metricsFixture())?.totalRuns).toBe(11)
    expect(aiInvocationMeasures(metricsFixture())?.invocations).toBe(3)
  })

  it('returns undefined when a meter is missing', () => {
    expect(checkRunMeasures({ credits: { used: null, percentOfBudget: null }, meters: [] })).toBeUndefined()
  })
})

describe('formatUsageTermsDetail', () => {
  it('renders the terms fields and an accounts table in the terminal', () => {
    const result = stripAnsi(formatUsageTermsDetail(termsFixture, 'terminal'))

    expect(result).toContain('Usage terms: Acme Corp')
    expect(result).toContain('Contract period:')
    expect(result).toContain('2026-01-01 → 2026-12-31')
    expect(result).toContain('Credit budget:')
    expect(result).toContain('1,000')
    expect(result).toContain('Standard credits / unit:')
    expect(result).toContain('ACCOUNTS')
    expect(result).toContain('Acme Production')
    expect(result).toContain('a1111111-1111-4111-8111-111111111111')
    expect(result).toContain(termsFixture.id)
  })

  it('renders null budget and rates as dashes', () => {
    const result = stripAnsi(formatUsageTermsDetail({
      ...termsFixture,
      creditBudget: null,
      standardCreditsPerUnit: null,
    }, 'terminal'))

    expect(result).toMatch(/Credit budget:\s+-/)
    expect(result).toMatch(/Standard credits \/ unit:\s+-/)
  })

  it('renders markdown with a field table and an accounts table', () => {
    const result = formatUsageTermsDetail(termsFixture, 'md')

    expect(result).toContain('# Usage terms: Acme Corp')
    expect(result).toContain('| Field | Value |')
    expect(result).toContain('| Credit budget | 1,000 |')
    expect(result).toContain('## Accounts')
    expect(result).toContain('| Name | ID |')
    expect(result).toContain('| Acme Staging | b2222222-2222-4222-8222-222222222222 |')
  })
})

describe('formatUsageWarnings', () => {
  const warnings: UsageWarning[] = [
    { code: 'PARTIAL_WINDOW', message: 'The requested range was clamped.' },
    { code: 'UNKNOWN_BUDGET', message: 'The credit budget is not available.' },
  ]

  it('returns an empty string when there are no warnings', () => {
    expect(formatUsageWarnings([], 'terminal')).toBe('')
    expect(formatUsageWarnings([], 'md')).toBe('')
  })

  it('renders one terminal line per warning with its code', () => {
    const result = stripAnsi(formatUsageWarnings(warnings, 'terminal'))
    const lines = result.split('\n')

    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('The requested range was clamped.')
    expect(lines[0]).toContain('(PARTIAL_WINDOW)')
  })

  it('renders markdown blockquotes', () => {
    const result = formatUsageWarnings(warnings, 'md')

    expect(result).toContain('> **Warning (PARTIAL_WINDOW):** The requested range was clamped.')
    expect(result).toContain('> **Warning (UNKNOWN_BUDGET):** The credit budget is not available.')
  })
})

export function summaryFixture (): UsageSummary {
  const window = (used: number | null, annual: number | null, atEnd: number | null, weeks: number | null) => ({
    usage: metricsFixture({ used, percentOfBudget: used === null ? null : used / 10 }),
    projectedAnnualPercentOfBudget: annual,
    projectedCreditsAtContractEnd: atEnd,
    projectedPercentAtContractEnd: atEnd === null ? null : atEnd / 10,
    projectedWeeksUntilExhausted: weeks,
  })

  return {
    usageTermsId: termsFixture.id,
    period: { from: '2026-01-01', to: '2026-01-31' },
    totals: metricsFixture(),
    projections: {
      weeksSinceStart: 4,
      weeksRemaining: 47,
      remainingCredits: 955,
      windows: {
        sinceStart: window(45, 57.2, 562, 87),
        last30Days: window(45, 54.75, 530, 92),
        last7Days: window(0, 0, 45, null),
        last1Day: window(0, 0, null, null),
      },
    },
  }
}

describe('formatUsageSummary', () => {
  it('renders the header, meters, and projection table in the terminal', () => {
    const result = stripAnsi(formatUsageSummary(summaryFixture(), 'terminal', termsFixture))

    expect(result).toContain('Usage: Acme Corp')
    expect(result).toContain('2026-01-01 → 2026-01-31')
    expect(result).toContain('Contract:')
    expect(result).toContain('2026-01-01 → 2026-12-31')
    expect(result).toContain('4 weeks since usage start, 47 remaining')
    expect(result).toMatch(/Credit budget:\s+1,000/)
    expect(result).toMatch(/Credits used:\s+45 \(4.5% of budget\)/)
    expect(result).toMatch(/Remaining credits:\s+955/)
    expect(result).toContain(termsFixture.id)

    expect(result).toContain('CHECK RUNS')
    expect(result).toMatch(/Total runs:\s+11/)
    expect(result).toMatch(/Playwright billable duration:\s+90.00s/)
    expect(result).toMatch(/Premium billable units:\s+7/)

    expect(result).toContain('RESOLVE')
    expect(result).toMatch(/Invocations:\s+3/)
    expect(result).toMatch(/Duration:\s+1.23s/)

    expect(result).toContain('PROJECTIONS')
    expect(result).toContain('WINDOW')
    expect(result).toContain('ANNUAL % OF BUDGET')
    expect(result).toContain('Since usage start')
    expect(result).toContain('57.2%')
    expect(result).toContain('Last 1 day')
  })

  it('renders without terms when they are not provided', () => {
    const result = stripAnsi(formatUsageSummary(summaryFixture(), 'terminal'))

    expect(result).toContain('Usage summary')
    expect(result).not.toContain('Contract:')
    expect(result).not.toContain('Credit budget:')
    expect(result).toMatch(/Credits used:\s+45 \(4.5% of budget\)/)
  })

  it('renders null credits and projections as dashes', () => {
    const summary = summaryFixture()
    summary.totals = metricsFixture({ used: null, percentOfBudget: null })
    summary.projections.remainingCredits = null

    const result = stripAnsi(formatUsageSummary(summary, 'terminal', { ...termsFixture, creditBudget: null }))

    expect(result).toMatch(/Credits used:\s+-/)
    expect(result).toMatch(/Remaining credits:\s+-/)
    expect(result).toMatch(/Last 1 day\s+0\s+0%\s+-\s+-\s+-/)
  })

  it('renders markdown sections and tables', () => {
    const result = formatUsageSummary(summaryFixture(), 'md', termsFixture)

    expect(result).toContain('# Usage: Acme Corp')
    expect(result).toContain('| Credits used | 45 (4.5% of budget) |')
    expect(result).toContain('## Check runs')
    expect(result).toContain('| Total runs | 11 |')
    expect(result).toContain('## Resolve')
    expect(result).toContain('| Invocations | 3 |')
    expect(result).toContain('## Projections')
    expect(result).toContain('| Window | Credits used | Annual % of budget | Credits at contract end | % at contract end | Weeks until exhausted |')
    expect(result).toContain('| Since usage start | 45 | 57.2% | 562 | 56.2% | 87 |')
    expect(result).toContain('| Last 1 day | 0 | 0% | - | - | - |')
  })
})

function rowFixture (overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    accountId: 'a1111111-1111-4111-8111-111111111111',
    checkType: 'API',
    ...metricsFixture(),
    ...overrides,
  }
}

describe('formatUsageSeries', () => {
  const accountNames = new Map(termsFixture.accounts.map(account => [account.id, account.name]))

  it('renders period, account name, check type, and metric columns in the terminal', () => {
    const result = stripAnsi(formatUsageSeries([rowFixture()], 'terminal', {
      interval: 'month',
      groupBy: 'account,checkType',
      accountNames,
    }))

    expect(result).toContain('PERIOD')
    expect(result).toContain('ACCOUNT')
    expect(result).toContain('CHECK TYPE')
    expect(result).toContain('TOTAL RUNS')
    expect(result).toContain('STANDARD UNITS')
    expect(result).toContain('PREMIUM UNITS')
    expect(result).toContain('CREDITS')
    expect(result).toContain('% OF BUDGET')
    expect(result).toContain('RESOLVE INVOCATIONS')
    expect(result).toContain('2026-01-01 → 2026-01-31')
    expect(result).toContain('Acme Production')
    expect(result).toContain('API')
    expect(result).toContain('4.5%')
  })

  it('shows only the start date for daily rows and falls back to the account id', () => {
    const result = stripAnsi(formatUsageSeries([rowFixture({ periodEnd: '2026-01-01' })], 'terminal', {
      interval: 'day',
      groupBy: 'account',
    }))

    expect(result).toContain('2026-01-01')
    expect(result).not.toContain('→')
    expect(result).toContain('a1111111-1111-4111-8111-111111111111')
    expect(result).not.toContain('CHECK TYPE')
  })

  it('omits the account column when not grouped by account', () => {
    const result = stripAnsi(formatUsageSeries([rowFixture({ accountId: undefined })], 'terminal', {
      interval: 'week',
      groupBy: 'checkType',
    }))

    expect(result).not.toContain('ACCOUNT')
    expect(result).toContain('CHECK TYPE')
  })

  it('shrinks the account column to keep rows within the terminal width', () => {
    // Fixed-width numeric columns add up to 125 chars; only the account column is flexible.
    const originalColumns = process.stdout.columns
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 140 })
    try {
      const result = stripAnsi(formatUsageSeries([rowFixture()], 'terminal', {
        interval: 'month',
        groupBy: 'account,checkType',
        accountNames: new Map([[rowFixture().accountId!, 'An account with an unusually long display name']]),
      }))
      for (const line of result.split('\n')) {
        expect(visWidth(line)).toBeLessThanOrEqual(140)
      }
      expect(result).toContain('…')
    } finally {
      Object.defineProperty(process.stdout, 'columns', { configurable: true, value: originalColumns })
    }
  })

  it('renders markdown with an explicit account id column', () => {
    const result = formatUsageSeries([rowFixture()], 'md', {
      interval: 'month',
      groupBy: 'account,checkType',
      accountNames,
    })

    expect(result).toContain(
      '| Period | Account | Account ID | Check type | Total runs | Standard units | Premium units | Credits | % of budget | Resolve invocations |',
    )
    expect(result).toContain(
      '| 2026-01-01 → 2026-01-31 | Acme Production | a1111111-1111-4111-8111-111111111111 | API | 11 | 12 | 7 | 45 | 4.5% | 3 |',
    )
  })
})

describe('series pagination helpers', () => {
  it('describes the page and whether more rows exist', () => {
    expect(stripAnsi(formatUsageSeriesPaginationInfo(1, null))).toBe('Showing 1 usage row')
    expect(stripAnsi(formatUsageSeriesPaginationInfo(100, 'cursor-1'))).toBe('Showing 100 usage rows (more available)')
  })

  it('renders a next-page hint that repeats the command and appends the cursor', () => {
    const hints = stripAnsi(formatUsageSeriesNavigationHints('cursor-1', 'checkly usage series --interval day --limit 100'))

    expect(hints).toContain('Next page:')
    expect(hints).toContain('checkly usage series --interval day --limit 100 --cursor cursor-1')
    expect(formatUsageSeriesNavigationHints(null, 'checkly usage series')).toBe('')
  })
})
