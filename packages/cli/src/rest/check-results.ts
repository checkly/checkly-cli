import type { AxiosInstance } from 'axios'

export interface CheckResult {
  id: string
  checkId: string
  name: string
  hasFailures: boolean
  hasErrors: boolean
  isDegraded: boolean | null
  overMaxResponseTime: boolean | null
  runLocation: string
  startedAt: string
  stoppedAt: string
  created_at: string
  responseTime: number
  checkRunId: number
  attempts: number
  resultType: 'FINAL' | 'ATTEMPT'
  sequenceId?: string | null
  apiCheckResult?: ApiCheckResult | null
  browserCheckResult?: BrowserCheckResult | null
  multiStepCheckResult?: MultiStepCheckResult | null
}

// --- API check result ---

export interface ApiCheckAssertion {
  source: string
  comparison: string
  target: string | number
  property?: string
}

export interface ApiCheckResult {
  assertions: ApiCheckAssertion[] | null
  request: {
    method: string
    url: string
    data: string
    headers: Record<string, string>
    params: Record<string, string>
  }
  response: {
    status: number
    statusText: string
    body: string
    headers: Record<string, string> | null
    timings: {
      socket: number
      lookup: number
      connect: number
      response: number
      end: number
    } | null
    timingPhases: {
      wait: number
      dns: number
      tcp: number
      firstByte: number
      download: number
      total: number
    } | null
  }
  requestError: string | null
  jobLog: unknown | null
  jobAssets: string[] | null
  pcapDataUrl: string | null
}

// --- Browser check result ---

export interface WebVitalEntry {
  score: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR'
  value: number
}

export interface BrowserCheckResult {
  type: string
  traceSummary: {
    consoleErrors: number
    networkErrors: number
    documentErrors: number
    userScriptErrors: number
  }
  errors: string[]
  pages: Array<{
    url: string
    webVitals: {
      CLS?: WebVitalEntry
      FCP?: WebVitalEntry
      LCP?: WebVitalEntry
      TBT?: WebVitalEntry
      TTFB?: WebVitalEntry
    }
  }>
  startTime: number
  endTime: number
  runtimeVersion: string
  jobLog: Array<{ time: number, msg: string, level: string }> | null
  jobAssets: string[] | null
  playwrightTestVideos?: string[]
  playwrightTestTraces?: string[]
  playwrightTestJsonReportFile?: string
}

// --- Multi-step check result ---

export interface MultiStepCheckResult {
  errors: string[]
  startTime: number
  endTime: number
  runtimeVersion: string
  jobLog: Array<{ time: number, msg: string, level: string }> | null
  jobAssets: string[] | null
  playwrightTestTraces?: string[]
  playwrightTestJsonReportFile?: string
}

export interface CheckResultsPage {
  length: number
  entries: CheckResult[]
  nextId: string | null
}

export interface ListCheckResultsParams {
  limit?: number
  nextId?: string
  from?: number
  to?: number
  hasFailures?: boolean
  resultType?: 'FINAL' | 'ATTEMPT'
}

class CheckResults {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll (checkId: string, params: ListCheckResultsParams = {}) {
    return this.api.get<CheckResultsPage>(`/v2/check-results/${checkId}`, { params })
  }

  get (checkId: string, checkResultId: string) {
    return this.api.get<CheckResult>(`/v1/check-results/${checkId}/${checkResultId}`)
  }
}

export default CheckResults
