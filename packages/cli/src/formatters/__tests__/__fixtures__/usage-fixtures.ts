import type { UsageMetrics, UsageSummary, UsageTerms } from '../../../rest/usage.js'

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
