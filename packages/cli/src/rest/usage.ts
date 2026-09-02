import type { AxiosInstance } from 'axios'

export type UsageInterval = 'total' | 'day' | 'week' | 'month'
export type UsageGroupBy = 'account' | 'checkType' | 'account,checkType'
export type UsageWarningCode = 'PARTIAL_WINDOW' | 'USAGE_TERMS_FLAGGED' | 'UNKNOWN_BUDGET'
export type UsageErrorCode =
  | 'ACCOUNT_NOT_IN_USAGE_TERMS'
  | 'INVALID_CURSOR'
  | 'INVALID_RANGE'
  | 'NO_USAGE_TERMS'
  | 'USAGE_STORE_UNAVAILABLE'
  | 'USAGE_TERMS_CONFLICT'

export interface UsageTermsParams {
  usageTermsId?: string
  /** YYYY-MM-DD, inclusive. Resolves the usage terms when usageTermsId is absent. */
  to?: string
}

export interface UsageRangeParams extends UsageTermsParams {
  /** YYYY-MM-DD, inclusive. */
  from?: string
  accountIds?: string[]
  checkTypes?: string[]
}

export interface UsageSeriesParams extends UsageRangeParams {
  interval?: UsageInterval
  groupBy?: UsageGroupBy
  limit?: number
  nextId?: string
}

export interface UsageAccount {
  id: string
  name: string
}

export interface UsageTerms {
  id: string
  name: string
  accounts: UsageAccount[]
  contractStartDate: string
  contractEndDate: string
  usageStartDate: string
  creditBudget: number | null
  standardCreditsPerUnit: number | null
  premiumCreditsPerUnit: number | null
}

export interface UsageCredits {
  used: number | null
  percentOfBudget: number | null
}

export interface CheckRunMeasures {
  totalRuns: number
  finalRuns: number
  retryRuns: number
  cancelledRuns: number
  multiStepRequests: number
  playwrightBillableDurationMs: number
  degradedRuns: number
  failedRuns: number
  errorRuns: number
  abortedRuns: number
  overMaxResponseTimeRuns: number
  standardBillableUnits: number
  premiumBillableUnits: number
}

export interface AiInvocationMeasures {
  invocations: number
  durationMs: number
}

export type UsageMeter =
  | { meterType: 'CHECK_RUN', measures: CheckRunMeasures }
  | { meterType: 'AI_INVOCATION', measures: AiInvocationMeasures }

export interface UsageMetrics {
  credits: UsageCredits
  meters: UsageMeter[]
}

export interface UsageWarning {
  code: UsageWarningCode
  message: string
}

export interface UsageProjectionWindow {
  usage: UsageMetrics
  projectedAnnualPercentOfBudget: number | null
  projectedCreditsAtContractEnd: number | null
  projectedPercentAtContractEnd: number | null
  projectedWeeksUntilExhausted: number | null
}

export interface UsageProjections {
  weeksSinceStart: number
  weeksRemaining: number
  remainingCredits: number | null
  windows: {
    sinceStart: UsageProjectionWindow
    last30Days: UsageProjectionWindow
    last7Days: UsageProjectionWindow
    last1Day: UsageProjectionWindow
  }
}

export interface UsageSummary {
  usageTermsId: string
  period: { from: string, to: string }
  totals: UsageMetrics
  projections: UsageProjections
}

export interface UsageRow extends UsageMetrics {
  periodStart: string
  periodEnd: string
  accountId?: string
  checkType?: string
}

export interface UsageSeries {
  usageTermsId: string
  period: { from: string, to: string, interval: UsageInterval, groupBy: UsageGroupBy }
  data: UsageRow[]
  length: number
  nextId: string | null
  warnings: UsageWarning[]
}

type QueryValue = string | number

// The API accepts repeated or comma-separated values. Axios would serialize
// arrays as `accountIds[]=…`, which Hapi keeps as a literal key, so join them.
function toQuery (params: UsageSeriesParams): Record<string, QueryValue> {
  const query: Record<string, QueryValue> = {}
  const set = (key: string, value: QueryValue | undefined) => {
    if (value !== undefined) query[key] = value
  }
  const joined = (values: string[] | undefined) => (values?.length ? values.join(',') : undefined)

  set('usageTermsId', params.usageTermsId)
  set('from', params.from)
  set('to', params.to)
  set('accountIds', joined(params.accountIds))
  set('checkTypes', joined(params.checkTypes))
  set('interval', params.interval)
  set('groupBy', params.groupBy)
  set('limit', params.limit)
  set('nextId', params.nextId)
  return query
}

class Usage {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getTerms (params: UsageTermsParams = {}) {
    return this.api.get<UsageTerms>('/v1/usage/terms', { params: toQuery(params) })
  }

  getSummary (params: UsageRangeParams = {}) {
    return this.api.get<UsageSummary>('/v1/usage/summary', { params: toQuery(params) })
  }

  getSeries (params: UsageSeriesParams = {}) {
    return this.api.get<UsageSeries>('/v1/usage/series', { params: toQuery(params) })
  }
}

export default Usage
