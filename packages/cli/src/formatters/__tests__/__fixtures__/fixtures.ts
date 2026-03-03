import type { Check } from '../../rest/checks'
import type { CheckStatus } from '../../rest/check-statuses'
import type { CheckResult, ApiCheckResult, BrowserCheckResult, MultiStepCheckResult } from '../../rest/check-results'
import type { ErrorGroup } from '../../rest/error-groups'
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
