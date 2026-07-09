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
  errorGroupIds?: string[] | null
  apiCheckResult?: ApiCheckResult | null
  browserCheckResult?: BrowserCheckResult | null
  multiStepCheckResult?: MultiStepCheckResult | null
  agenticCheckResult?: AgenticCheckResult | null
  tracerouteCheckResult?: TracerouteCheckResult | null
  grpcCheckResult?: GrpcCheckResult | null
  sslCheckResult?: SslCheckResult | null
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

// --- Agentic check result ---

export interface AgenticAssertion {
  condition?: string | null
  passed?: boolean | null
  actual?: string | null
  expected?: string | null
}

export interface AgenticSuggestion {
  summary?: string | null
  prompt?: string | null
  secrets?: string[] | null
  category?: 'credentials' | 'endpoint' | 'configuration' | null
}

export interface AgenticStep {
  type?: 'tool_call' | 'tool_result' | 'message' | null
  name?: string | null
  input?: Record<string, unknown> | null
  output?: string | null
  timestamp?: string | null
  sequenceNumber?: number | null
}

/**
 * The agentic check result shape returned by the public API for AGENTIC
 * checks. Every field is optional/nullable on purpose: the agentic product
 * is still early-stage, and the backend may reshape this payload under a
 * new API version. Consumers should degrade gracefully when fields are
 * missing rather than assume a particular structure.
 *
 * Note: `model`, `costUsd`, and `tokensUsed` exist in the runner's raw
 * metadata but are intentionally NOT part of the public response shape.
 * The backend strips them from the serialized response today, and the CLI
 * does not render them even if they ever re-appear on an envelope it
 * receives.
 */
export interface AgenticCheckResult {
  summary?: string | null
  prompt?: string | null
  assertions?: AgenticAssertion[] | null
  suggestions?: AgenticSuggestion[] | null
  steps?: AgenticStep[] | null
  errors?: Array<{ error?: { message?: string | null } | null }> | null
  artifactManifest?: Record<string, string> | null
  jobLog?: unknown | null
  jobAssets?: string[] | null
}

// --- Traceroute / gRPC / SSL check results ---
//
// Failure-debug diagnostics for the three uptime monitor types, mirroring the
// typed fields the public check-results response carries (see the backend
// `check-results/schemas.js` CheckResultTraceroute/Grpc/Ssl schemas). The
// documented top-level scalars are typed; the open runner sub-objects
// (`timingPhases`, `request`, `assertions`, `certificate`, `securityBaseline`,
// per-hop entries) stay `Record<string, unknown>` / arrays so no runner field
// is silently dropped. Every field is optional/nullable: a metadata-only uptime
// result still emits a (sparse) diagnostic.

export interface TracerouteCheckResult {
  totalHops?: number | null
  destinationReached?: boolean | null
  finalHopLatency?: Record<string, unknown> | null
  timingPhases?: Record<string, unknown> | null
  requestError?: string | null
  request?: Record<string, unknown> | null
  assertions?: Array<Record<string, unknown>> | null
  response?: {
    hostname?: string | null
    resolvedIp?: string | null
    totalHops?: number | null
    destinationReached?: boolean | null
    truncationReason?: string | null
    finalHopLatency?: Record<string, unknown> | null
    hops?: Array<Record<string, unknown>> | null
    protocol?: string | null
    probeProtocol?: string | null
  } | null
}

export interface GrpcCheckResult {
  grpcStatusCode?: number | null
  healthStatus?: number | null
  timingPhases?: Record<string, unknown> | null
  requestError?: string | null
  request?: Record<string, unknown> | null
  assertions?: Array<Record<string, unknown>> | null
  response?: {
    grpcMode?: string | null
    host?: string | null
    resolvedIp?: string | null
    port?: number | null
    grpcMethod?: string | null
    responseMessage?: string | null
    grpcStatusCode?: number | null
    grpcStatusMessage?: string | null
    healthStatus?: number | null
    healthStatusLabel?: string | null
    metadata?: Array<Record<string, unknown>> | null
    discoveredMethods?: string[] | null
    requestError?: string | null
    timingPhases?: Record<string, unknown> | null
  } | null
}

export interface SslCheckResult {
  tlsVersion?: string | null
  cipherSuite?: string | null
  daysUntilExpiry?: number | null
  handshakeTimeMs?: number | null
  chainTrusted?: boolean | null
  hostnameVerified?: boolean | null
  baselineVerdict?: string | null
  baselineGrade?: string | null
  failureCategory?: string | null
  requestError?: string | null
  request?: Record<string, unknown> | null
  assertions?: Array<Record<string, unknown>> | null
  response?: {
    resolvedIp?: string | null
    protocol?: string | null
    cipherSuite?: string | null
    handshakeTimeMs?: number | null
    hostnameVerified?: boolean | null
    chainTrusted?: boolean | null
    daysUntilExpiry?: number | null
    ocspStapled?: boolean | null
    securityBaseline?: Record<string, unknown> | null
    certificate?: Record<string, unknown> | null
    chain?: Array<Record<string, unknown>> | null
  } | null
}

export interface CheckResultsPage {
  length: number
  entries: CheckResult[]
  nextId: string | null
}

// Result fields the backend `GET /v2/check-results/{checkId}` endpoint accepts
// for projection via the `fields` query parameter. Requesting a narrow subset
// lets the backend skip selecting and decorating wide payloads (metadata,
// assets, apiCheckResult, browserCheckResult, …) that a given view never needs.
export type CheckResultField =
  | 'id'
  | 'name'
  | 'checkId'
  | 'hasFailures'
  | 'hasErrors'
  | 'isDegraded'
  | 'isCancelled'
  | 'overMaxResponseTime'
  | 'runLocation'
  | 'startedAt'
  | 'stoppedAt'
  | 'created_at'
  | 'createdAt'
  | 'responseTime'
  | 'apiCheckResult'
  | 'browserCheckResult'
  | 'multiStepCheckResult'
  | 'agenticCheckResult'
  | 'tracerouteCheckResult'
  | 'grpcCheckResult'
  | 'sslCheckResult'
  | 'playwrightCheckResult'
  | 'checkRunId'
  | 'attempts'
  | 'resultType'
  | 'sequenceId'
  | 'traceId'
  | 'errorGroupIds'

export interface ListCheckResultsParams {
  limit?: number
  nextId?: string
  from?: number
  to?: number
  hasFailures?: boolean
  resultType?: 'FINAL' | 'ATTEMPT' | 'ALL'
  fields?: CheckResultField[]
}

class CheckResults {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll (checkId: string, params: ListCheckResultsParams = {}) {
    // Serialize `fields` as a single comma-separated value rather than relying on
    // Axios array serialization. The backend accepts both `fields=id,startedAt`
    // and repeated `fields=id&fields=startedAt`, and the comma form is the
    // safest, most predictable shape across HTTP clients.
    const requestParams = { ...params, fields: params.fields?.join(',') }
    return this.api.get<CheckResultsPage>(`/v2/check-results/${checkId}`, { params: requestParams })
  }

  get (checkId: string, checkResultId: string) {
    return this.api.get<CheckResult>(`/v1/check-results/${checkId}/${checkResultId}`)
  }
}

export default CheckResults
