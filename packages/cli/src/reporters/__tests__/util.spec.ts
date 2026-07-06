import { Settings } from 'luxon'
import { describe, it, expect, beforeAll } from 'vitest'

import { formatCheckTitle, formatCheckResult, CheckStatus, resultToCheckStatus } from '../util.js'
import { simpleCheckFixture } from './fixtures/simple-check.js'
import { apiCheckResult } from './fixtures/api-check-result.js'
import { browserCheckResult } from './fixtures/browser-check-result.js'
import { agenticCheckResult, agenticCheckResultWithFailures } from './fixtures/agentic-check-result.js'
import {
  tracerouteCheckResult,
  grpcCheckResult,
  sslCheckResult,
} from './fixtures/uptime-check-results.js'

function stripAnsi (input: string): string {
  return input.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

beforeAll(() => {
  Settings.defaultZone = 'GMT'
})

describe('formatCheckTitle()', () => {
  it('should print a failed check title', () => {
    const title = stripAnsi(formatCheckTitle(CheckStatus.FAILED, simpleCheckFixture, { includeSourceFile: true }))
    expect(title).toContain('/test/test-file.check.ts')
    expect(title).toContain('Test Check')
  })
  it('should print a passed check title', () => {
    const title = stripAnsi(formatCheckTitle(CheckStatus.SUCCESSFUL, simpleCheckFixture, { includeSourceFile: true }))
    expect(title).toContain('/test/test-file.check.ts')
    expect(title).toContain('Test Check')
  })
  it('should print a degraded check title', () => {
    const title = stripAnsi(formatCheckTitle(CheckStatus.DEGRADED, simpleCheckFixture, { includeSourceFile: true }))
    expect(title).toContain('/test/test-file.check.ts')
    expect(title).toContain('Test Check')
  })
  it('should print a running check title', () => {
    const title = stripAnsi(formatCheckTitle(CheckStatus.RUNNING, simpleCheckFixture, { includeSourceFile: true }))
    expect(title).toContain('/test/test-file.check.ts')
    expect(title).toContain('Test Check')
  })
  it('should print a scheduling check title', () => {
    const title = stripAnsi(formatCheckTitle(CheckStatus.SCHEDULING, simpleCheckFixture, { includeSourceFile: true }))
    expect(title).toContain('/test/test-file.check.ts')
    expect(title).toContain('Test Check')
  })
})

describe('formatCheckResult()', () => {
  describe('API Check result', () => {
    it('formats a basic API Check result ', () => {
      const basicApiCheckResult = { ...apiCheckResult }
      basicApiCheckResult.checkRunData.assertions = []
      basicApiCheckResult.logs.setup = []
      basicApiCheckResult.logs.teardown = []
      expect(stripAnsi(formatCheckResult(apiCheckResult)))
        .toMatchSnapshot('api-check-result-basic-format')
    })
    it('formats an API Check result with assertions', () => {
      const basicApiCheckResult = { ...apiCheckResult }
      basicApiCheckResult.logs.setup = []
      basicApiCheckResult.logs.teardown = []
      expect(stripAnsi(formatCheckResult(apiCheckResult)))
        .toMatchSnapshot('api-check-result-assertions-format')
    })
    it('formats an API Check result with setup & teardown logs', () => {
      const basicApiCheckResult = { ...apiCheckResult }
      basicApiCheckResult.checkRunData.assertions = []
      expect(stripAnsi(formatCheckResult(apiCheckResult)))
        .toMatchSnapshot('api-check-result-logs-format')
    })
    it('formats an API Check result with a scheduleError', () => {
      const basicApiCheckResult = { ...apiCheckResult }
      basicApiCheckResult.checkRunData.assertions = []
      basicApiCheckResult.logs.setup = []
      basicApiCheckResult.logs.teardown = []
      basicApiCheckResult.scheduleError = 'There was a scheduling error'
      expect(stripAnsi(formatCheckResult(basicApiCheckResult)))
        .toMatchSnapshot('api-check-result-schedule-error-format')
    })
  })
  describe('Browser Check result', () => {
    it('formats a basic Browser Check result ', () => {
      const basicBrowserCheckResult = { ...browserCheckResult }
      basicBrowserCheckResult.logs = []
      expect(stripAnsi(formatCheckResult(basicBrowserCheckResult)))
        .toMatchSnapshot('browser-check-result-basic-format')
    })
    it('formats a Browser Check result with logs', () => {
      expect(stripAnsi(formatCheckResult(browserCheckResult)))
        .toMatchSnapshot('browser-check-result-logs-format')
    })
    it('formats a Browser Check result with a scheduleError', () => {
      const basicBrowserCheckResult = { ...browserCheckResult }
      basicBrowserCheckResult.scheduleError = 'There was a scheduling error'
      expect(stripAnsi(formatCheckResult(basicBrowserCheckResult)))
        .toMatchSnapshot('browser-check-result-schedule-error-format')
    })
  })
  describe('Agentic Check result', () => {
    it('formats a passing Agentic Check result with all sections', () => {
      expect(stripAnsi(formatCheckResult(agenticCheckResult)))
        .toMatchSnapshot('agentic-check-result-passing-format')
    })
    it('formats a failing Agentic Check result with assertion details and errors', () => {
      expect(stripAnsi(formatCheckResult(agenticCheckResultWithFailures)))
        .toMatchSnapshot('agentic-check-result-failing-format')
    })
    it('includes the human-readable section titles', () => {
      const output = stripAnsi(formatCheckResult(agenticCheckResult))
      expect(output).toContain('Summary')
      expect(output).toContain('Assertions')
      expect(output).toContain('Steps (4)')
      expect(output).toContain('Suggestions')
      expect(output).toContain('✓ The homepage returns an HTTP 200 status')
    })
    it('renders assertion failures with expected/actual context', () => {
      const output = stripAnsi(formatCheckResult(agenticCheckResultWithFailures))
      expect(output).toContain('✗ The homepage returns an HTTP 200 status')
      expect(output).toContain('expected "200", got "503"')
      expect(output).toContain('Agent Errors')
      expect(output).toContain('503 Service Unavailable')
    })
    it('skips agentic rendering if agenticCheckResult is missing', () => {
      // This guards the branch-entry condition — a result that somehow lacks
      // agenticCheckResult should not crash or render an empty AGENTIC block.
      const withoutTypedField = { ...agenticCheckResult, agenticCheckResult: undefined }
      const output = stripAnsi(formatCheckResult(withoutTypedField))
      expect(output).not.toContain('Summary')
      expect(output).not.toContain('Assertions')
    })
  })
  describe('Traceroute Check result', () => {
    it('formats a failing Traceroute Check result', () => {
      expect(stripAnsi(formatCheckResult(tracerouteCheckResult)))
        .toMatchSnapshot('traceroute-check-result-format')
    })
    it('surfaces the diagnostic block', () => {
      const output = stripAnsi(formatCheckResult(tracerouteCheckResult))
      expect(output).toContain('Traceroute Response')
      expect(output).toContain('unreachable.example.com')
      expect(output).toContain('Total Hops: 30')
      expect(output).toContain('Destination Reached: no')
      expect(output).toContain('Truncated: max-hops')
      expect(output).toContain('gateway.local')
      expect(output).toContain('loss 100%')
    })
  })
  describe('gRPC Check result', () => {
    it('formats a failing gRPC Check result', () => {
      expect(stripAnsi(formatCheckResult(grpcCheckResult)))
        .toMatchSnapshot('grpc-check-result-format')
    })
    it('surfaces the diagnostic block', () => {
      const output = stripAnsi(formatCheckResult(grpcCheckResult))
      expect(output).toContain('gRPC Response')
      expect(output).toContain('grpc.example.com:443')
      expect(output).toContain('Status: 14 connection refused')
      expect(output).toContain('Health: NOT_SERVING')
      expect(output).toContain('grpc.health.v1.Health/Watch')
    })
    it('renders the response time from timingPhases.total', () => {
      const output = stripAnsi(formatCheckResult(grpcCheckResult))
      expect(output).toContain('Response Time: 90ms')
    })
    it('humanizes gRPC assertion sources', () => {
      const withAssertions = {
        ...grpcCheckResult,
        checkRunData: {
          ...grpcCheckResult.checkRunData,
          assertions: [
            { source: 'GRPC_STATUS_CODE', comparison: 'EQUALS', property: '', regex: null, target: '0', error: 'boom', actual: 14 },
            { source: 'GRPC_HEALTHCHECK_STATUS', comparison: 'EQUALS', property: '', regex: null, target: 'SERVING', error: 'boom', actual: 'NOT_SERVING' },
          ],
        },
      }
      const output = stripAnsi(formatCheckResult(withAssertions))
      expect(output).toContain('status code')
      expect(output).toContain('health check status')
      expect(output).not.toContain('GRPC_STATUS_CODE')
    })
    it('suppresses the Assertions block when a requestError is set', () => {
      const withError = {
        ...grpcCheckResult,
        checkRunData: {
          ...grpcCheckResult.checkRunData,
          requestError: 'connection refused',
          assertions: [
            { source: 'GRPC_STATUS_CODE', comparison: 'EQUALS', property: '', regex: null, target: '0', error: '', actual: 14 },
          ],
        },
      }
      const output = stripAnsi(formatCheckResult(withError))
      expect(output).toContain('Request Error')
      expect(output).not.toContain('Assertions')
      expect(output).not.toContain('status code')
    })
  })
  describe('SSL Check result', () => {
    it('formats a failing SSL Check result', () => {
      expect(stripAnsi(formatCheckResult(sslCheckResult)))
        .toMatchSnapshot('ssl-check-result-format')
    })
    it('surfaces the diagnostic block', () => {
      const output = stripAnsi(formatCheckResult(sslCheckResult))
      expect(output).toContain('SSL Response')
      expect(output).toContain('TLS: TLS 1.3 / TLS_AES_256_GCM_SHA384')
      expect(output).toContain('Expires in: expired 5 day(s) ago')
      expect(output).toContain('Chain Trusted: no')
      expect(output).toContain('Hostname Verified: no')
    })
    it('explains a response-time failure and renders the baseline verdict', () => {
      const output = stripAnsi(formatCheckResult(sslCheckResult))
      // handshakeTimeMs 48.2 > maxResponseTime 40
      expect(output).toContain('Response time 48.200ms exceeded max 40.000ms')
      expect(output).toContain('Baseline: fail (grade F)')
    })
    it('explains a degraded response-time verdict when only degraded is exceeded', () => {
      const degraded = {
        ...sslCheckResult,
        checkRunData: {
          ...sslCheckResult.checkRunData,
          degradedResponseTime: 40,
          maxResponseTime: 60,
        },
      }
      const output = stripAnsi(formatCheckResult(degraded))
      expect(output).toContain('Response time 48.200ms exceeded degraded 40.000ms')
    })
    it('omits the response-time reason when thresholds are not exceeded', () => {
      const ok = {
        ...sslCheckResult,
        checkRunData: {
          ...sslCheckResult.checkRunData,
          degradedResponseTime: 100,
          maxResponseTime: 200,
        },
      }
      const output = stripAnsi(formatCheckResult(ok))
      expect(output).not.toContain('exceeded')
    })
  })
})

describe('resultToCheckStatus()', () => {
  it('returns a successful status', () => {
    expect(resultToCheckStatus({ hasFailures: false, isDegraded: false, hasErrors: false }))
      .toBe(CheckStatus.SUCCESSFUL)
  })
  it('returns a failed status', () => {
    expect(resultToCheckStatus({ hasFailures: true, isDegraded: false, hasErrors: false }))
      .toBe(CheckStatus.FAILED)
  })
  it('returns a failed status when also degraded', () => {
    expect(resultToCheckStatus({ hasFailures: true, isDegraded: true, hasErrors: false }))
      .toBe(CheckStatus.FAILED)
  })
  it('returns a degraded status', () => {
    expect(resultToCheckStatus({ hasFailures: false, isDegraded: true, hasErrors: false }))
      .toBe(CheckStatus.DEGRADED)
  })
  it('returns cancelled when isCancelled is true', () => {
    expect(resultToCheckStatus({ isCancelled: true }))
      .toBe(CheckStatus.CANCELLED)
  })
  it('returns cancelled when isCancelled is true even if hasFailures is also true', () => {
    expect(resultToCheckStatus({ isCancelled: true, hasFailures: true }))
      .toBe(CheckStatus.CANCELLED)
  })
})

describe('formatCheckTitle() with CANCELLED status', () => {
  it('should use the ⊘ symbol for a cancelled check title', () => {
    const result = stripAnsi(formatCheckTitle(CheckStatus.CANCELLED, simpleCheckFixture))
    expect(result).toContain('⊘')
  })
})
