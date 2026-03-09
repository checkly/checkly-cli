import type { AxiosInstance } from 'axios'

export type QuickRange = 'last24Hours' | 'last7Days' | 'last30Days' | 'thisWeek' | 'thisMonth' | 'lastWeek' | 'lastMonth'

export const quickRangeValues: QuickRange[] = [
  'last24Hours', 'last7Days', 'last30Days', 'thisWeek', 'thisMonth', 'lastWeek', 'lastMonth',
]

const checkTypeToPath: Record<string, string> = {
  API: 'api-checks',
  BROWSER: 'browser-checks',
  PLAYWRIGHT: 'playwright-checks',
  MULTI_STEP: 'multistep-checks',
  HEARTBEAT: 'heartbeat-checks',
  TCP: 'tcp-checks',
  ICMP: 'icmp',
  DNS: 'dns',
  URL: 'url-monitors',
}

// Default aggregated metrics per check type
const defaultMetrics: Record<string, string[]> = {
  API: ['availability', 'responseTime_avg', 'responseTime_p50', 'responseTime_p95', 'responseTime_p99'],
  BROWSER: ['availability', 'responseTime_avg', 'responseTime_p50', 'responseTime_p95', 'responseTime_p99'],
  PLAYWRIGHT: ['availability', 'responseTime_avg', 'responseTime_p50', 'responseTime_p95', 'responseTime_p99'],
  MULTI_STEP: ['availability', 'responseTime_avg', 'responseTime_p50', 'responseTime_p95', 'responseTime_p99'],
  URL: ['availability', 'responseTime_avg', 'responseTime_p50', 'responseTime_p95', 'responseTime_p99'],
  TCP: ['availability', 'total_avg', 'total_p50', 'total_p95', 'total_p99'],
  DNS: ['availability', 'total_avg', 'total_p50', 'total_p95', 'total_p99'],
  ICMP: ['availability', 'packetLoss_avg', 'latencyAvg_avg', 'latencyAvg_p50', 'latencyAvg_p95', 'latencyAvg_p99'],
  HEARTBEAT: ['availability'],
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
  series: Array<{ data: Record<string, any> }>
  metadata: Array<{ key: string, label: string, unit: string }>
}

export interface GetAnalyticsOptions {
  quickRange?: QuickRange
  metrics?: string[]
}

class Analytics {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async get (checkId: string, checkType: string, options: GetAnalyticsOptions = {}): Promise<AnalyticsResponse> {
    const pathSegment = checkTypeToPath[checkType]
    if (!pathSegment) {
      throw new Error(`Unsupported check type: ${checkType}`)
    }

    const metrics = options.metrics ?? defaultMetrics[checkType] ?? ['availability']

    const { data } = await this.api.get<AnalyticsResponse>(`/v1/analytics/${pathSegment}/${checkId}`, {
      params: {
        metrics: metrics.join(','),
        quickRange: options.quickRange || 'last24Hours',
      },
    })

    return data
  }

  async listMetrics (checkType: string): Promise<Array<{
    name: string
    unit: string
    label: string
    aggregated: boolean
  }>> {
    const { data } = await this.api.get('/v1/analytics/metrics', {
      params: { checkType },
    })
    return data
  }
}

export default Analytics
