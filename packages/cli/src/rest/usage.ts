import type { AxiosInstance } from 'axios'

export const USAGE_INTERVALS = ['total', 'day', 'week', 'month'] as const
export type UsageInterval = typeof USAGE_INTERVALS[number]
export const USAGE_GROUP_DIMENSIONS = ['account', 'usageTerm', 'pricingRule', 'checkType'] as const
export type UsageGroupDimension = typeof USAGE_GROUP_DIMENSIONS[number]
export const USAGE_SERIES_INCLUDES = ['calculations', 'runs'] as const
export type UsageSeriesInclude = typeof USAGE_SERIES_INCLUDES[number]
export const USAGE_PRICING_RULE_KEYS = [
  'apiChecks', 'multistepChecks', 'browserChecks', 'playwrightCheckSuites', 'uptimeMonitors', 'aiInvocations',
  'statusPages', 'statusPageAdditionalServices', 'statusPageAdditionalSubscribers', 'additionalSms', 'additionalPhoneAlerts',
] as const
export type UsagePricingRuleKey = typeof USAGE_PRICING_RULE_KEYS[number]
export type UsageCheckType =
  | 'AGENTIC' | 'API' | 'BROWSER' | 'HEARTBEAT' | 'ICMP' | 'MULTI_STEP' | 'TCP' | 'PLAYWRIGHT'
  | 'URL' | 'DNS' | 'SSL' | 'GRPC' | 'TRACEROUTE'
export type UsageCreditsUsed = number | null
export type UsagePackageModel = 'limits' | 'credits'

export interface UsagePeriod { from: string, to: string }
export interface UsageCoverage { gaps: UsagePeriod[] }
export interface UnitPricingRule {
  method: 'per_unit'
  quantity: number
  unit: string
  credits: number
  rates?: Array<{ when: string, credits: number }>
  included?: { quantity: number, period?: string }
}
export interface PeriodPricingRule {
  method: 'per_period'
  period: 'day'
  price: { annualCredits: number }
}
export interface CapacityBlockPricingRule {
  method: 'capacity_blocks_per_period'
  period: 'day'
  unit: string
  included: { quantity: number }
  block: { quantity: number, annualCredits: number }
}
export type UsagePricingRule = UnitPricingRule | PeriodPricingRule | CapacityBlockPricingRule
export type UsagePricingRules = Partial<Record<UsagePricingRuleKey, UsagePricingRule>>
export interface UsageAccount { id: string, name: string }
export interface UsageTerm {
  id: string
  name: string
  accounts: UsageAccount[]
  contractStartDate: string
  contractEndDate: string
  usageStartDate: string
  creditBudget: number | null
  standardCreditsPerUnit: number | null
  premiumCreditsPerUnit: number | null
  packageModel: UsagePackageModel | null
  pricingRules: UsagePricingRules | null
}
export interface UsageTermsCollection { data: UsageTerm[], nextId: string | null }
export interface UnitUsageCalculation {
  rateCondition: string | null
  measuredQuantity: number
  includedQuantity: number | null
  billableQuantity: number | null
  creditsUsed: UsageCreditsUsed
}
export interface PeriodUsageCalculation {
  billableResourceDays: number
  appliedDailyCredits: number
  proration: { daysPerYear: 365 }
  creditsUsed: UsageCreditsUsed
}
export interface CapacityBlockUsageCalculation {
  scope: 'statusPage'
  measuredQuantity: number
  includedQuantity: number
  billableBlockDays: number
  appliedDailyCreditsPerBlock: number
  proration: { daysPerYear: 365 }
  creditsUsed: UsageCreditsUsed
}
export type UsageCalculation = UnitUsageCalculation | PeriodUsageCalculation | CapacityBlockUsageCalculation
export interface UsageBreakdown {
  usageTermsId: string
  pricingRuleKey: UsagePricingRuleKey
  accountId?: string
  period: UsagePeriod
  pricingRule: UsagePricingRule | null
  calculations: UsageCalculation[]
  creditsUsed: UsageCreditsUsed
}
export interface UsageSummary {
  period: UsagePeriod
  usageTermsIds: string[]
  totals: { creditsUsed: UsageCreditsUsed }
  breakdown: UsageBreakdown[]
  coverage: UsageCoverage
}
export interface UsageContribution {
  usageTermsId: string
  pricingRuleKey: UsagePricingRuleKey
  creditsUsed: UsageCreditsUsed
  period?: UsagePeriod
  pricingRule?: UsagePricingRule | null
  calculations?: UsageCalculation[]
}
export interface UsageRunCounts {
  totalRuns: number
  finalRuns: number
  retryRuns: number
  cancelledRuns: number
  degradedRuns: number
  failedRuns: number
  errorRuns: number
  abortedRuns: number
  overMaxResponseTimeRuns: number
}
export interface UsageSeriesRow {
  periodStart: string
  periodEnd: string
  dimensions: {
    accountId?: string
    usageTermsId?: string
    pricingRuleKey?: UsagePricingRuleKey
    checkType?: UsageCheckType | null
  }
  creditsUsed: UsageCreditsUsed
  contributions: UsageContribution[]
  runs?: UsageRunCounts | null
}
export interface UsageSeries {
  period: UsagePeriod
  usageTermsIds: string[]
  interval: UsageInterval
  groupBy: UsageGroupDimension[]
  data: UsageSeriesRow[]
  coverage: UsageCoverage
  nextId: string | null
}
export interface UsageProjectionWindow {
  period: UsagePeriod | null
  observedDays: number
  creditsUsed: UsageCreditsUsed
  averageDailyCredits: number | null
  projectedAnnualPercentOfBudget: number | null
  projectedCreditsAtContractEnd: number | null
  projectedRemainingCredits: number | null
  projectedPercentAtContractEnd: number | null
  projectedWeeksUntilExhausted: number | null
}
export interface UsageProjections {
  usageTermsId: string
  asOf: string
  period: UsagePeriod | null
  weeksSinceStart: number
  weeksRemaining: number
  creditsUsed: UsageCreditsUsed
  remainingCredits: number | null
  budgetedDailyCredits: number | null
  windows: {
    sinceStart: UsageProjectionWindow
    last30Days: UsageProjectionWindow
    last7Days: UsageProjectionWindow
    last1Day: UsageProjectionWindow
  }
}
export interface UsageTermsParams {
  from?: string
  to?: string
  limit?: number
  nextId?: string
}
export interface UsageRangeParams {
  from?: string
  to?: string
  usageTermsIds?: string[]
  accountIds?: string[]
  pricingRuleKeys?: UsagePricingRuleKey[]
}
export interface UsageSeriesParams extends UsageRangeParams {
  interval?: UsageInterval
  groupBy?: UsageGroupDimension[]
  include?: UsageSeriesInclude[]
  limit?: number
  nextId?: string
}
export interface UsageProjectionsParams { asOf?: string }

function toQuery (params: UsageSeriesParams): Record<string, string | number> {
  const query: Record<string, string | number> = {}
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined) query[key] = value
  }
  const joined = (values: string[] | undefined) => values?.length ? values.join(',') : undefined
  set('from', params.from)
  set('to', params.to)
  set('usageTermsIds', joined(params.usageTermsIds))
  set('accountIds', joined(params.accountIds))
  set('pricingRuleKeys', joined(params.pricingRuleKeys))
  set('interval', params.interval)
  set('groupBy', joined(params.groupBy))
  set('include', joined(params.include))
  set('limit', params.limit)
  set('nextId', params.nextId)
  return query
}

class Usage {
  constructor (private readonly api: AxiosInstance) {}

  listTerms (params: UsageTermsParams = {}) {
    return this.api.get<UsageTermsCollection>('/v2/usage/terms', { params: toQuery(params) })
  }

  getTerm (id: string) {
    return this.api.get<UsageTerm>(`/v2/usage/terms/${encodeURIComponent(id)}`)
  }

  getSummary (params: UsageRangeParams = {}) {
    return this.api.get<UsageSummary>('/v2/usage/summary', { params: toQuery(params) })
  }

  getSeries (params: UsageSeriesParams = {}) {
    return this.api.get<UsageSeries>('/v2/usage/series', { params: toQuery(params) })
  }

  getProjections (id: string, params: UsageProjectionsParams = {}) {
    return this.api.get<UsageProjections>(`/v2/usage/terms/${encodeURIComponent(id)}/projections`, { params })
  }
}

export default Usage
