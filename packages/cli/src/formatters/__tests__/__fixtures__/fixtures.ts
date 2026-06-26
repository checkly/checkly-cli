import type { Check } from '../../rest/checks'
import type { CheckStatus } from '../../rest/check-statuses'
import type {
  CheckResult,
  ApiCheckResult,
  BrowserCheckResult,
  MultiStepCheckResult,
  AgenticCheckResult,
  TracerouteCheckResult,
  GrpcCheckResult,
  SslCheckResult,
} from '../../rest/check-results'
import type { ErrorGroup, RootCauseAnalysis } from '../../rest/error-groups'
import type { CheckWithStatus } from '../checks'

// --- Check statuses ---

export const passingStatus: CheckStatus = {
  name: 'My API Check',
  checkId: 'check-1',
  hasFailures: false,
  hasErrors: false,
  isDegraded: false,
  longestRun: 500,
  shortestRun: 100,
  lastRunLocation: 'eu-west-1',
  lastCheckRunId: 'run-1',
  sslDaysRemaining: 90,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-06-15T12:00:00.000Z',
}

export const failingStatus: CheckStatus = {
  ...passingStatus,
  name: 'Failing Check',
  checkId: 'check-2',
  hasFailures: true,
  hasErrors: false,
  isDegraded: false,
}

export const degradedStatus: CheckStatus = {
  ...passingStatus,
  name: 'Degraded Check',
  checkId: 'check-3',
  hasFailures: false,
  hasErrors: false,
  isDegraded: true,
}

// --- Base check ---

const baseCheck: Check = {
  id: 'check-1',
  name: 'My API Check',
  description: null,
  checkType: 'API',
  activated: true,
  muted: false,
  frequency: 10,
  frequencyOffset: 0,
  locations: ['eu-west-1', 'us-east-1'],
  privateLocations: [],
  tags: ['production', 'api'],
  groupId: null,
  groupOrder: null,
  runtimeId: '2024.02',
  scriptPath: null,
  request: { url: 'https://api.example.com/health', method: 'GET' },
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-06-15T12:00:00.000Z',
}

// --- Checks with status ---

export const passingCheck: CheckWithStatus = {
  ...baseCheck,
  status: passingStatus,
}

export const failingCheck: CheckWithStatus = {
  ...baseCheck,
  id: 'check-2',
  name: 'Failing Browser Check',
  checkType: 'BROWSER',
  tags: ['production', 'browser'],
  status: failingStatus,
}

export const inactiveCheck: CheckWithStatus = {
  ...baseCheck,
  id: 'check-3',
  name: 'Inactive Check',
  activated: false,
  tags: [],
  status: undefined,
}

export const mutedCheck: CheckWithStatus = {
  ...baseCheck,
  id: 'check-4',
  name: 'Muted Check',
  muted: true,
  status: passingStatus,
}

export const errorStatus: CheckStatus = {
  ...passingStatus,
  name: 'Error Check',
  checkId: 'check-5',
  hasFailures: false,
  hasErrors: true,
  isDegraded: false,
}

// --- Additional checks with status ---

export const errorCheck: CheckWithStatus = {
  ...baseCheck,
  id: 'check-5',
  name: 'Error Check',
  checkType: 'API',
  tags: ['production'],
  status: errorStatus,
}

export const degradedCheck: CheckWithStatus = {
  ...baseCheck,
  id: 'check-6',
  name: 'Degraded Check',
  checkType: 'API',
  tags: ['staging'],
  status: degradedStatus,
}

export const mutedFailingCheck: CheckWithStatus = {
  ...baseCheck,
  id: 'check-7',
  name: 'Muted Failing Check',
  muted: true,
  status: failingStatus,
}

export const mutedDegradedCheck: CheckWithStatus = {
  ...baseCheck,
  id: 'check-8',
  name: 'Muted Degraded Check',
  muted: true,
  status: degradedStatus,
}

export const checkWithPrivateLocations: CheckWithStatus = {
  ...baseCheck,
  id: 'check-9',
  name: 'Private Location Check',
  locations: ['eu-west-1'],
  privateLocations: ['on-prem-dc-1', 'on-prem-dc-2'],
  status: passingStatus,
}

export const checkWithLowSsl: CheckWithStatus = {
  ...baseCheck,
  id: 'check-10',
  name: 'Low SSL Check',
  status: {
    ...passingStatus,
    checkId: 'check-10',
    sslDaysRemaining: 7,
  },
}

export const checkWithMediumSsl: CheckWithStatus = {
  ...baseCheck,
  id: 'check-11',
  name: 'Medium SSL Check',
  status: {
    ...passingStatus,
    checkId: 'check-11',
    sslDaysRemaining: 20,
  },
}

export const checkWithNoSsl: CheckWithStatus = {
  ...baseCheck,
  id: 'check-12',
  name: 'No SSL Check',
  status: {
    ...passingStatus,
    checkId: 'check-12',
    sslDaysRemaining: null,
  },
}

// --- Check results ---

export const apiCheckResult: CheckResult = {
  id: 'result-1',
  checkId: 'check-1',
  name: 'My API Check',
  hasFailures: false,
  hasErrors: false,
  isDegraded: false,
  overMaxResponseTime: false,
  runLocation: 'eu-west-1',
  startedAt: '2025-06-15T12:00:00.000Z',
  stoppedAt: '2025-06-15T12:00:01.000Z',
  created_at: '2025-06-15T12:00:01.000Z',
  responseTime: 245,
  checkRunId: 1001,
  attempts: 1,
  resultType: 'FINAL',
  apiCheckResult: {
    assertions: [
      { source: 'STATUS_CODE', comparison: 'EQUALS', target: 200 },
      { source: 'JSON_BODY', property: '$.status', comparison: 'EQUALS', target: 'ok' },
    ],
    request: {
      method: 'GET',
      url: 'https://api.example.com/health',
      data: '',
      headers: { Accept: 'application/json' },
      params: {},
    },
    response: {
      status: 200,
      statusText: '200 OK',
      body: '{"status":"ok","version":"1.2.3"}',
      headers: { 'content-type': 'application/json' },
      timings: { socket: 1, lookup: 5, connect: 10, response: 200, end: 245 },
      timingPhases: { dns: 5, tcp: 10, wait: 15, firstByte: 200, download: 15, total: 245 },
    },
    requestError: null,
    jobLog: null,
    jobAssets: null,
    pcapDataUrl: null,
  } as ApiCheckResult,
}

export const browserCheckResult: CheckResult = {
  id: 'result-2',
  checkId: 'check-2',
  name: 'Failing Browser Check',
  hasFailures: true,
  hasErrors: false,
  isDegraded: false,
  overMaxResponseTime: false,
  runLocation: 'us-east-1',
  startedAt: '2025-06-15T12:00:00.000Z',
  stoppedAt: '2025-06-15T12:00:05.000Z',
  created_at: '2025-06-15T12:00:05.000Z',
  responseTime: 5200,
  checkRunId: 1002,
  attempts: 1,
  resultType: 'FINAL',
  browserCheckResult: {
    type: 'playwright',
    traceSummary: {
      consoleErrors: 2,
      networkErrors: 1,
      documentErrors: 0,
      userScriptErrors: 0,
    },
    errors: ['TimeoutError: page.click: Timeout 30000ms exceeded'],
    pages: [
      {
        url: 'https://app.example.com/dashboard',
        webVitals: {
          LCP: { score: 'GOOD', value: 1200 },
          FCP: { score: 'GOOD', value: 800 },
          CLS: { score: 'NEEDS_IMPROVEMENT', value: 0.15 },
          TBT: { score: 'POOR', value: 600 },
          TTFB: { score: 'GOOD', value: 120 },
        },
      },
    ],
    startTime: 0,
    endTime: 5200,
    runtimeVersion: '2024.02',
    jobLog: [
      { time: 0, msg: 'Starting browser check', level: 'INFO' },
      { time: 5000, msg: 'TimeoutError: page.click: Timeout 30000ms exceeded', level: 'ERROR' },
    ],
    jobAssets: ['screenshot-1.png'],
    playwrightTestTraces: ['trace-1.zip'],
    playwrightTestVideos: ['video-1.webm'],
  } as BrowserCheckResult,
}

export const multiStepCheckResult: CheckResult = {
  id: 'result-3',
  checkId: 'check-5',
  name: 'Multi-Step Checkout Flow',
  hasFailures: false,
  hasErrors: true,
  isDegraded: null,
  overMaxResponseTime: false,
  runLocation: 'ap-southeast-1',
  startedAt: '2025-06-15T12:00:00.000Z',
  stoppedAt: '2025-06-15T12:00:08.000Z',
  created_at: '2025-06-15T12:00:08.000Z',
  responseTime: 8000,
  checkRunId: 1003,
  attempts: 2,
  resultType: 'FINAL',
  multiStepCheckResult: {
    errors: ['Error: Payment step failed', 'AssertionError: Expected cart total to match'],
    startTime: 0,
    endTime: 8000,
    runtimeVersion: '2024.02',
    jobLog: [
      { time: 0, msg: 'Step 1: Navigate to homepage', level: 'INFO' },
      { time: 2000, msg: 'Step 2: Add item to cart', level: 'INFO' },
      { time: 5000, msg: 'Step 3: Checkout', level: 'INFO' },
      { time: 7500, msg: 'Error: Payment step failed', level: 'ERROR' },
    ],
    jobAssets: ['screenshot-failure.png'],
    playwrightTestTraces: ['trace-checkout.zip'],
  } as MultiStepCheckResult,
}

export const apiCheckResultWithError: CheckResult = {
  ...apiCheckResult,
  id: 'result-5',
  hasErrors: true,
  apiCheckResult: {
    ...apiCheckResult.apiCheckResult!,
    requestError: 'ECONNREFUSED: Connection refused to https://api.example.com/health',
    request: {
      ...apiCheckResult.apiCheckResult!.request,
      data: '{"query":"test","filters":{"active":true}}',
    },
    response: {
      ...apiCheckResult.apiCheckResult!.response,
      status: 0,
      statusText: '',
      body: '',
      headers: null,
      timingPhases: null,
    },
    jobLog: {
      setup: [{ time: 0, msg: 'Setting up request', level: 'INFO' }],
      request: [{ time: 100, msg: 'ECONNREFUSED', level: 'ERROR' }],
      teardown: [],
    },
  } as ApiCheckResult,
}

export const browserCheckResultWithObjectErrors: CheckResult = {
  ...browserCheckResult,
  id: 'result-6',
  browserCheckResult: {
    ...browserCheckResult.browserCheckResult!,
    // The API sometimes returns error objects instead of strings
    errors: [
      { name: 'Error', message: 'expect(received).toBe(expected) // Object.is equality' },
    ] as any,
  } as BrowserCheckResult,
}

export const minimalCheckResult: CheckResult = {
  id: 'result-4',
  checkId: 'check-6',
  name: 'Heartbeat Check',
  hasFailures: false,
  hasErrors: false,
  isDegraded: null,
  overMaxResponseTime: null,
  runLocation: 'eu-west-1',
  startedAt: '2025-06-15T12:00:00.000Z',
  stoppedAt: '2025-06-15T12:00:00.500Z',
  created_at: '2025-06-15T12:00:00.500Z',
  responseTime: 50,
  checkRunId: 1004,
  attempts: 1,
  resultType: 'FINAL',
}

export const agenticCheckResult: CheckResult = {
  id: 'result-7',
  checkId: 'check-7',
  name: 'Homepage Health (Agentic)',
  hasFailures: false,
  hasErrors: false,
  isDegraded: null,
  overMaxResponseTime: null,
  runLocation: 'us-east-1',
  startedAt: '2025-06-15T12:00:00.000Z',
  stoppedAt: '2025-06-15T12:00:12.000Z',
  created_at: '2025-06-15T12:00:12.000Z',
  responseTime: 12000,
  checkRunId: 1007,
  attempts: 1,
  resultType: 'FINAL',
  agenticCheckResult: {
    summary: 'The homepage loaded successfully and all assertions passed.',
    prompt: 'Navigate to https://www.checklyhq.com and verify the homepage loads successfully.',
    assertions: [
      {
        condition: 'The homepage returns an HTTP 200 status',
        passed: true,
        actual: '200',
        expected: '200',
      },
      {
        condition: 'The page heading is "Checkly"',
        passed: true,
        actual: 'Checkly',
        expected: 'Checkly',
      },
    ],
    suggestions: [
      {
        summary: 'Also verify the pricing page loads',
        prompt: 'After the homepage loads, navigate to /pricing and confirm all plans are visible.',
        secrets: [],
        category: 'configuration',
      },
    ],
    steps: [
      { type: 'message', output: 'Starting the check.', timestamp: '2025-06-15T12:00:00.100Z', sequenceNumber: 1 },
      { type: 'tool_call', name: 'http_request', input: { method: 'GET', url: 'https://www.checklyhq.com' }, timestamp: '2025-06-15T12:00:00.200Z', sequenceNumber: 2 },
      { type: 'tool_result', name: 'http_request', output: '200 OK', timestamp: '2025-06-15T12:00:01.500Z', sequenceNumber: 3 },
      { type: 'message', output: 'Homepage loaded, verifying heading.', timestamp: '2025-06-15T12:00:01.600Z', sequenceNumber: 4 },
    ],
    errors: [],
  } as AgenticCheckResult,
}

export const agenticCheckResultWithFailures: CheckResult = {
  ...agenticCheckResult,
  id: 'result-8',
  hasFailures: true,
  agenticCheckResult: {
    ...agenticCheckResult.agenticCheckResult!,
    summary: 'The homepage did not return a 200 status.',
    assertions: [
      {
        condition: 'The homepage returns an HTTP 200 status',
        passed: false,
        actual: '503',
        expected: '200',
      },
    ],
    errors: [
      { error: { message: 'Request failed: 503 Service Unavailable' } },
    ],
  } as AgenticCheckResult,
}

export const agenticCheckResultMinimal: CheckResult = {
  ...agenticCheckResult,
  id: 'result-9',
  agenticCheckResult: {
    // Empty-but-structured: runner has only produced the envelope so far.
    summary: '',
    prompt: 'Verify the homepage loads.',
    assertions: [],
    suggestions: [],
    steps: [],
    errors: [],
  } as AgenticCheckResult,
}

// --- Error groups ---

export const activeErrorGroup: ErrorGroup = {
  id: 'eg-1',
  checkId: 'check-2',
  errorHash: 'abc123',
  rawErrorMessage: 'TimeoutError: page.click: Timeout 30000ms exceeded',
  cleanedErrorMessage: 'TimeoutError: page.click: Timeout 30000ms exceeded',
  firstSeen: '2025-06-01T00:00:00.000Z',
  lastSeen: '2025-06-15T12:00:00.000Z',
  archivedUntilNextEvent: false,
}

export const archivedErrorGroup: ErrorGroup = {
  id: 'eg-2',
  checkId: 'check-2',
  errorHash: 'def456',
  rawErrorMessage: 'NetworkError: Failed to fetch',
  cleanedErrorMessage: 'NetworkError: Failed to fetch',
  firstSeen: '2025-05-01T00:00:00.000Z',
  lastSeen: '2025-05-15T00:00:00.000Z',
  archivedUntilNextEvent: true,
}

// --- Root cause analyses ---

export const sampleRca: RootCauseAnalysis = {
  id: 'rca-1',
  created_at: '2025-06-15T10:00:00.000Z',
  analysis: {
    classification: 'INFRASTRUCTURE_ERROR',
    rootCause: 'The upstream API returned HTTP 503 Service Unavailable after a long server processing time (~28s TTFB), indicating a transient backend issue.',
    userImpact: 'Users in ap-south-1 cannot trigger checks via the API. Requests fail with 503 after ~28 seconds.',
    codeFix: 'Add retry logic with exponential backoff for transient 503 responses.',
    evidence: [
      {
        artifacts: [{ name: 'HTTP_REQUEST', type: 'REQUEST' }],
        description: 'The HTTP request completed with status 503 Service Unavailable.',
      },
      {
        artifacts: [{ name: 'TIMING_PHASES', type: 'TIMINGS' }],
        description: 'DNS and TCP times are sub-2ms while TTFB is ~28.2s.',
      },
      {
        artifacts: [
          { name: 'TRACE_ROUTE', type: 'TRACE' },
          { name: 'PACKET_CAPTURE', type: 'BINARY' },
        ],
        description: 'No sustained network outage; the failure is on the application side.',
      },
    ],
    referenceLinks: [
      { url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/503', title: 'HTTP 503 Service Unavailable' },
    ],
  },
  provider: 'openai',
  model: 'gpt-5.1',
  durationMs: 9459,
  userContext: [{ text: 'checkly-backend', type: 'TAG' }],
}

export const sampleRcaMinimal: RootCauseAnalysis = {
  id: 'rca-2',
  created_at: '2025-06-14T08:00:00.000Z',
  analysis: {
    classification: 'APPLICATION_ERROR',
    rootCause: 'The API endpoint /users returns 404 because the route was removed in a recent deployment.',
    userImpact: 'User profile pages fail to load.',
    codeFix: null,
    evidence: null,
    referenceLinks: null,
  },
  provider: 'openai',
  model: 'gpt-5.1',
  durationMs: 5000,
  userContext: null,
}

export const errorGroupWithRca: ErrorGroup = {
  ...activeErrorGroup,
  id: 'eg-rca-1',
  rootCauseAnalyses: [sampleRca],
}

export const errorGroupWithMultipleRcas: ErrorGroup = {
  ...activeErrorGroup,
  id: 'eg-rca-2',
  rootCauseAnalyses: [sampleRca, sampleRcaMinimal],
}

export const errorGroupWithoutRca: ErrorGroup = {
  ...activeErrorGroup,
  id: 'eg-no-rca',
  rootCauseAnalyses: [],
}

// --- Traceroute / gRPC / SSL check results (public-API CheckResult shape) ---
// Failing runs of each type, mirroring the 4.1 public check-results fields.

const baseDiagnosticResult = {
  hasErrors: false,
  isDegraded: false,
  overMaxResponseTime: false,
  runLocation: 'eu-west-1',
  startedAt: '2025-06-15T12:00:00.000Z',
  stoppedAt: '2025-06-15T12:00:01.000Z',
  created_at: '2025-06-15T12:00:01.000Z',
  attempts: 1,
  resultType: 'FINAL' as const,
}

export const tracerouteCheckResultDetail: TracerouteCheckResult = {
  totalHops: 30,
  destinationReached: false,
  finalHopLatency: { avg_ms: 24.1, best_ms: 22.0, worst_ms: 31.4 },
  requestError: null,
  response: {
    hostname: 'unreachable.example.com',
    resolvedIp: '203.0.113.10',
    totalHops: 30,
    destinationReached: false,
    truncationReason: 'max-hops',
    protocol: 'TCP',
    finalHopLatency: { avg_ms: 24.1, best_ms: 22.0, worst_ms: 31.4 },
    hops: [
      { hop_number: 1, main_ip: '10.0.0.1', main_host: 'gateway.local', loss_percentage: 0, rtt: { avg: 1.2, best: 1.0, worst: 1.5 } },
      { hop_number: 2, main_ip: '198.51.100.5', loss_percentage: 100, rtt: null, asn: 64500 },
    ],
  },
}

export const tracerouteCheckResult: CheckResult = {
  ...baseDiagnosticResult,
  id: 'result-tr-1',
  checkId: 'check-tr',
  name: 'Traceroute to unreachable host',
  hasFailures: true,
  responseTime: 1000,
  checkRunId: 2001,
  tracerouteCheckResult: tracerouteCheckResultDetail,
}

export const grpcCheckResultDetail: GrpcCheckResult = {
  grpcStatusCode: 14,
  healthStatus: 2,
  requestError: null,
  response: {
    grpcMode: 'HEALTH',
    host: 'grpc.example.com',
    resolvedIp: '203.0.113.20',
    port: 443,
    grpcMethod: 'grpc.health.v1.Health/Check',
    responseMessage: '',
    grpcStatusCode: 14,
    grpcStatusMessage: 'connection refused',
    healthStatus: 2,
    healthStatusLabel: 'NOT_SERVING',
    metadata: [{ key: 'content-type', value: 'application/grpc' }],
    discoveredMethods: ['grpc.health.v1.Health/Check', 'grpc.health.v1.Health/Watch'],
  },
}

export const grpcCheckResult: CheckResult = {
  ...baseDiagnosticResult,
  id: 'result-grpc-1',
  checkId: 'check-grpc',
  name: 'gRPC health probe',
  hasFailures: true,
  responseTime: 90,
  checkRunId: 2002,
  grpcCheckResult: grpcCheckResultDetail,
}

export const sslCheckResultDetail: SslCheckResult = {
  tlsVersion: 'TLS 1.3',
  cipherSuite: 'TLS_AES_256_GCM_SHA384',
  daysUntilExpiry: -5,
  handshakeTimeMs: 48.2,
  chainTrusted: false,
  hostnameVerified: false,
  baselineVerdict: 'FAIL',
  baselineGrade: 'C',
  failureCategory: 'expired',
  requestError: null,
  response: {
    resolvedIp: '203.0.113.30',
    protocol: 'TLS 1.3',
    cipherSuite: 'TLS_AES_256_GCM_SHA384',
    handshakeTimeMs: 48.2,
    hostnameVerified: false,
    chainTrusted: false,
    daysUntilExpiry: -5,
    ocspStapled: false,
  },
}

export const sslCheckResult: CheckResult = {
  ...baseDiagnosticResult,
  id: 'result-ssl-1',
  checkId: 'check-ssl',
  name: 'SSL certificate expiry',
  hasFailures: true,
  responseTime: 48,
  checkRunId: 2003,
  sslCheckResult: sslCheckResultDetail,
}
