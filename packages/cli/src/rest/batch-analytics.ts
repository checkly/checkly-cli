import type { AxiosInstance } from 'axios'

export interface BatchAnalyticsResult {
  checkId: string
  checkType: string
  availability: number | null
  responseTime_avg: number | null
  responseTime_p50: number | null
  responseTime_p95: number | null
  responseTime_p99: number | null
  latency_avg: number | null
  latency_p50: number | null
  latency_p95: number | null
  latency_p99: number | null
  packetLoss_avg: number | null
  packetLoss_p95: number | null
  packetLoss_p99: number | null
}

export type BatchQuickRange = 'last24Hours' | 'last7Days' | 'thisWeek' | 'lastWeek' | 'lastMonth'

export const batchQuickRangeValues: BatchQuickRange[] = [
  'last24Hours', 'last7Days', 'thisWeek', 'lastWeek', 'lastMonth',
]

class BatchAnalytics {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  get (checkIds: string[], quickRange: BatchQuickRange = 'last24Hours') {
    return this.api.post<BatchAnalyticsResult[]>(
      '/v1/analytics/checks',
      { checkIds },
      { params: { quickRange } },
    )
  }
}

export default BatchAnalytics
