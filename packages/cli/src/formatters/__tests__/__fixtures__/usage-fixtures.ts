import type { UsageProjections, UsageSeries, UsageSummary, UsageTerm } from '../../../rest/usage.js'

export const TERM_ID = '550e8400-e29b-41d4-a716-446655440000'
export const RENEWAL_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8'
export const ACCOUNT_ID = 'a1111111-1111-1111-1111-111111111111'

export const termFixture: UsageTerm = {
  id: TERM_ID,
  name: 'Acme Corp',
  accounts: [{ id: ACCOUNT_ID, name: 'Acme Production' }],
  contractStartDate: '2026-01-01',
  contractEndDate: '2026-06-30',
  usageStartDate: '2026-01-02',
  creditBudget: 1000,
  standardCreditsPerUnit: 0.0001,
  premiumCreditsPerUnit: null,
  packageModel: 'credits',
  pricingRules: {
    apiChecks: {
      method: 'per_unit', quantity: 1000, unit: 'runs', credits: 0.1234,
      included: { quantity: 100, period: 'day' },
      rates: [{ when: 'premium', credits: 0.5678 }],
    },
    statusPages: { method: 'per_period', period: 'day', price: { annualCredits: 365.0123 } },
    statusPageAdditionalServices: {
      method: 'capacity_blocks_per_period', period: 'day', unit: 'services',
      included: { quantity: 5 }, block: { quantity: 10, annualCredits: 36.5012 },
    },
  },
}

export const renewalFixture: UsageTerm = {
  id: RENEWAL_ID,
  name: 'Acme Renewal',
  accounts: [{ id: ACCOUNT_ID, name: 'Acme Production' }],
  contractStartDate: '2026-07-02',
  contractEndDate: '2026-12-31',
  usageStartDate: '2026-07-02',
  creditBudget: 2000,
  standardCreditsPerUnit: null,
  premiumCreditsPerUnit: null,
  packageModel: 'credits',
  pricingRules: null,
}

export const summaryFixture: UsageSummary = {
  period: { from: '2026-06-30', to: '2026-07-02' },
  usageTermsIds: [TERM_ID, RENEWAL_ID],
  totals: { creditsUsed: null },
  coverage: { gaps: [{ from: '2026-07-01', to: '2026-07-01' }] },
  breakdown: [
    {
      usageTermsId: TERM_ID, pricingRuleKey: 'apiChecks', accountId: ACCOUNT_ID,
      period: { from: '2026-06-30', to: '2026-06-30' },
      pricingRule: { method: 'per_unit', quantity: 1000, unit: 'runs', credits: 0.1234 },
      calculations: [{ rateCondition: null, measuredQuantity: 5000, includedQuantity: 100,
        billableQuantity: 4900, creditsUsed: 0.6047 }],
      creditsUsed: 0.6047,
    },
    {
      usageTermsId: TERM_ID, pricingRuleKey: 'statusPages',
      period: { from: '2026-06-30', to: '2026-06-30' },
      pricingRule: { method: 'per_period', period: 'day', price: { annualCredits: 365.0123 } },
      calculations: [{ billableResourceDays: 2, appliedDailyCredits: 1.0001,
        proration: { daysPerYear: 365 }, creditsUsed: 2.0002 }],
      creditsUsed: 2.0002,
    },
    {
      usageTermsId: RENEWAL_ID, pricingRuleKey: 'statusPageAdditionalServices',
      period: { from: '2026-07-02', to: '2026-07-02' },
      pricingRule: { method: 'capacity_blocks_per_period', period: 'day', unit: 'services',
        included: { quantity: 5 }, block: { quantity: 10, annualCredits: 36.5012 } },
      calculations: [{ scope: 'statusPage', measuredQuantity: 18, includedQuantity: 5,
        billableBlockDays: 2, appliedDailyCreditsPerBlock: 0.1,
        proration: { daysPerYear: 365 }, creditsUsed: 0.2 }],
      creditsUsed: 0.2,
    },
  ],
}

export const seriesFixture: UsageSeries = {
  period: { from: '2026-07-02', to: '2026-07-03' },
  usageTermsIds: [RENEWAL_ID],
  interval: 'day',
  groupBy: ['account', 'usageTerm', 'pricingRule', 'checkType'],
  coverage: { gaps: [] },
  nextId: 'opaque cursor',
  data: [{
    periodStart: '2026-07-02', periodEnd: '2026-07-02',
    dimensions: { accountId: ACCOUNT_ID, usageTermsId: RENEWAL_ID, pricingRuleKey: 'apiChecks', checkType: 'API' },
    creditsUsed: 0.1234,
    contributions: [{ usageTermsId: RENEWAL_ID, pricingRuleKey: 'apiChecks', creditsUsed: 0.1234,
      period: { from: '2026-07-02', to: '2026-07-02' },
      pricingRule: { method: 'per_unit', quantity: 1000, unit: 'runs', credits: 0.1234 },
      calculations: [{ rateCondition: 'premium', measuredQuantity: 1000, includedQuantity: null,
        billableQuantity: 1000, creditsUsed: 0.1234 }] }],
    runs: { totalRuns: 13, finalRuns: 10, retryRuns: 3, cancelledRuns: 1, degradedRuns: 2,
      failedRuns: 4, errorRuns: 5, abortedRuns: 6, overMaxResponseTimeRuns: 7 },
  }],
}

export const projectionsFixture: UsageProjections = {
  usageTermsId: TERM_ID, asOf: '2026-06-01',
  period: { from: '2026-01-02', to: '2026-06-01' },
  weeksSinceStart: 21, weeksRemaining: 4,
  creditsUsed: 1100.0001, remainingCredits: -100.0001, budgetedDailyCredits: 5.5866,
  windows: {
    sinceStart: {
      period: { from: '2026-01-02', to: '2026-06-01' }, observedDays: 151,
      creditsUsed: 1100.0001, averageDailyCredits: 7.2848, projectedAnnualPercentOfBudget: 265.89,
      projectedCreditsAtContractEnd: 1311.2584, projectedRemainingCredits: -311.2584,
      projectedPercentAtContractEnd: 131.13, projectedWeeksUntilExhausted: 0,
    },
    last30Days: {
      period: { from: '2026-05-03', to: '2026-06-01' }, observedDays: 30,
      creditsUsed: 150.1234, averageDailyCredits: 5.0041, projectedAnnualPercentOfBudget: 182.65,
      projectedCreditsAtContractEnd: 1245.1194, projectedRemainingCredits: -245.1194,
      projectedPercentAtContractEnd: 124.51, projectedWeeksUntilExhausted: 0,
    },
    last7Days: {
      period: { from: '2026-05-26', to: '2026-06-01' }, observedDays: 7,
      creditsUsed: 0, averageDailyCredits: 0, projectedAnnualPercentOfBudget: 0,
      projectedCreditsAtContractEnd: 1100.0001, projectedRemainingCredits: -100.0001,
      projectedPercentAtContractEnd: 110, projectedWeeksUntilExhausted: null,
    },
    last1Day: {
      period: { from: '2026-06-01', to: '2026-06-01' }, observedDays: 1,
      creditsUsed: null, averageDailyCredits: null, projectedAnnualPercentOfBudget: null,
      projectedCreditsAtContractEnd: null, projectedRemainingCredits: null,
      projectedPercentAtContractEnd: null, projectedWeeksUntilExhausted: null,
    },
  },
}
