import type { AxiosInstance } from 'axios'
import { CheckTypes, type CheckType } from '../constants'

export type QuickRange = 'last24Hours' | 'last7Days' | 'last30Days' | 'thisWeek' | 'thisMonth' | 'lastWeek' | 'lastMonth'

export const quickRangeValues: QuickRange[] = [
  'last24Hours', 'last7Days', 'last30Days', 'thisWeek', 'thisMonth', 'lastWeek', 'lastMonth',
]

const checkTypeToPath: Record<CheckType, string> = {
  [CheckTypes.API]: 'api-checks',
  [CheckTypes.BROWSER]: 'browser-checks',
  [CheckTypes.PLAYWRIGHT]: 'playwright-checks',
  [CheckTypes.MULTI_STEP]: 'multistep-checks',
  [CheckTypes.HEARTBEAT]: 'heartbeat-checks',
  [CheckTypes.TCP]: 'tcp-checks',
  [CheckTypes.ICMP]: 'icmp',
  [CheckTypes.DNS]: 'dns',
  [CheckTypes.URL]: 'url-monitors',
  [CheckTypes.AGENTIC]: 'agentic-checks',
}

// Default aggregated metrics per check type
const defaultMetrics: Record<CheckType, string[]> = {
  [CheckTypes.API]: ['availability', 'responseTime_avg', 'responseTime_p50', 'responseTime_p95', 'responseTime_p99'],
  [CheckTypes.BROWSER]: ['availability', 'LCP_avg', 'CLS_avg', 'TBT_avg', 'responseTime_avg', 'responseTime_p95'],
  [CheckTypes.PLAYWRIGHT]: ['availability', 'LCP_avg', 'CLS_avg', 'TBT_avg', 'responseTime_avg', 'responseTime_p95'],
  [CheckTypes.MULTI_STEP]: ['availability', 'responseTime_avg', 'responseTime_p50', 'responseTime_p95', 'responseTime_p99'],
  [CheckTypes.URL]: ['availability', 'responseTime_avg', 'responseTime_p50', 'responseTime_p95', 'responseTime_p99'],
  [CheckTypes.TCP]: ['availability', 'total_avg', 'total_p50', 'total_p95', 'total_p99'],
  [CheckTypes.DNS]: ['availability', 'total_avg', 'total_p50', 'total_p95', 'total_p99'],
  [CheckTypes.ICMP]: ['availability', 'packetLoss_avg', 'latencyAvg_avg', 'latencyAvg_p50', 'latencyAvg_p95', 'latencyAvg_p99'],
  [CheckTypes.HEARTBEAT]: ['availability'],
  [CheckTypes.AGENTIC]: ['availability'],
}

export type GroupBy = 'runLocation' | 'statusCode'

export interface AnalyticsSeriesEntry {
  data: Record<string, any>[] | Record<string, any>
  runLocation?: string
  statusCode?: number
}

export interface AnalyticsResponse {
  checkId: string
  name: string
  checkType: string
  activated: boolean
  muted: boolean
  frequency: number
  from: string
  to: string
  tags: string[]
  series: AnalyticsSeriesEntry[]
  metadata: Record<string, { key?: string, label: string, unit: string }>
  requestedMetrics?: string[]
}

export interface GetAnalyticsOptions {
  quickRange?: QuickRange
  metrics?: string[]
  groupBy?: GroupBy
  filterByStatus?: 'success' | 'failure'
}

class Analytics {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async get (
    checkId: string, checkType: string, options: GetAnalyticsOptions = {},
  ): Promise<{ data: AnalyticsResponse }> {
    const pathSegment = checkTypeToPath[checkType as CheckType]
    if (!pathSegment) {
      throw new Error(`Unsupported check type: ${checkType}`)
    }

    const metrics = options.metrics ?? defaultMetrics[checkType as CheckType] ?? ['availability']

    const params: Record<string, string> = {
      metrics: metrics.join(','),
      quickRange: options.quickRange || 'last24Hours',
    }
    if (options.groupBy) params.groupBy = options.groupBy
    if (options.filterByStatus) params.filterByStatus = options.filterByStatus

    const response = await this.api.get<AnalyticsResponse>(`/v1/analytics/${pathSegment}/${checkId}`, {
      params,
    })

    // Attach which metrics were requested so formatters can filter/order
    response.data.requestedMetrics = metrics
    return response
  }
}

export default Analytics
