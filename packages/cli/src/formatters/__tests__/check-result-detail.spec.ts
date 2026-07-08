import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import logSymbols from 'log-symbols'
import { stripAnsi } from '../render.js'

// log-symbols ships pre-colored (ANSI-wrapped) glyphs; strip them so the
// symbols match the stripped/markdown assertion output.
const PASS = stripAnsi(logSymbols.success)
const FAIL = stripAnsi(logSymbols.error)
import {
  formatResultDetail,
  groupAttemptsBySequence,
  extractResultErrorSummary,
  formatAttemptsSection,
} from '../check-result-detail.js'
import type { CheckResult } from '../../rest/check-results.js'
import {
  apiCheckResult,
  apiCheckResultWithError,
  browserCheckResult,
  browserCheckResultWithObjectErrors,
  multiStepCheckResult,
  minimalCheckResult,
  agenticCheckResult,
  agenticCheckResultWithFailures,
  agenticCheckResultMinimal,
  tracerouteCheckResult,
  grpcCheckResult,
  sslCheckResult,
} from './__fixtures__/fixtures.js'

// Pin time for formatDate used in result detail
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-06-15T12:05:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('formatResultDetail', () => {
  describe('API check result', () => {
    it('renders terminal output', () => {
      const result = stripAnsi(formatResultDetail(apiCheckResult, 'terminal'))
      expect(result).toMatchSnapshot('api-result-detail-terminal')
    })

    it('renders markdown output', () => {
      const result = formatResultDetail(apiCheckResult, 'md')
      expect(result).toMatchSnapshot('api-result-detail-md')
    })

    it('contains request and response sections in terminal', () => {
      const result = stripAnsi(formatResultDetail(apiCheckResult, 'terminal'))
      expect(result).toContain('REQUEST')
      expect(result).toContain('RESPONSE')
      expect(result).toContain('GET')
      expect(result).toContain('https://api.example.com/health')
      expect(result).toContain('200')
      expect(result).toContain('TIMING')
      expect(result).toContain('ASSERTIONS')
    })
  })

  describe('API check result with requestError and jobLog', () => {
    it('renders ERROR section when requestError is set', () => {
      const result = stripAnsi(formatResultDetail(apiCheckResultWithError, 'terminal'))
      expect(result).toContain('ERROR')
      expect(result).toContain('ECONNREFUSED')
    })

    it('renders request body when present', () => {
      const result = stripAnsi(formatResultDetail(apiCheckResultWithError, 'terminal'))
      expect(result).toContain('Body:')
      expect(result).toContain('"query"')
    })

    it('renders jobLog from object with phases', () => {
      const result = stripAnsi(formatResultDetail(apiCheckResultWithError, 'terminal'))
      expect(result).toContain('JOB LOG')
      expect(result).toContain('Setting up request')
      expect(result).toContain('ECONNREFUSED')
    })

    it('omits TIMING section when timingPhases is null', () => {
      const result = stripAnsi(formatResultDetail(apiCheckResultWithError, 'terminal'))
      expect(result).not.toContain('TIMING')
    })

    it('renders terminal snapshot', () => {
      const result = stripAnsi(formatResultDetail(apiCheckResultWithError, 'terminal'))
      expect(result).toMatchSnapshot('api-result-with-error-terminal')
    })
  })

  describe('Browser check result', () => {
    it('renders terminal output', () => {
      const result = stripAnsi(formatResultDetail(browserCheckResult, 'terminal'))
      expect(result).toMatchSnapshot('browser-result-detail-terminal')
    })

    it('renders markdown output', () => {
      const result = formatResultDetail(browserCheckResult, 'md')
      expect(result).toMatchSnapshot('browser-result-detail-md')
    })

    it('includes web vitals, errors, and assets in terminal', () => {
      const result = stripAnsi(formatResultDetail(browserCheckResult, 'terminal'))
      expect(result).toContain('BROWSER RESULT')
      expect(result).toContain('WEB VITALS')
      expect(result).toContain('ERRORS')
      expect(result).toContain('ASSETS')
      expect(result).toContain('screenshot')
      expect(result).toContain('trace')
      expect(result).toContain('video')
    })
  })

  describe('Browser check result with object errors', () => {
    it('renders error message instead of [object Object]', () => {
      const result = stripAnsi(formatResultDetail(browserCheckResultWithObjectErrors, 'terminal'))
      expect(result).toContain('ERRORS')
      expect(result).toContain('expect(received).toBe(expected)')
      expect(result).not.toContain('[object Object]')
    })

    it('renders error message in markdown', () => {
      const result = formatResultDetail(browserCheckResultWithObjectErrors, 'md')
      expect(result).toContain('expect(received).toBe(expected)')
      expect(result).not.toContain('[object Object]')
    })
  })

  describe('Multi-step check result', () => {
    it('renders terminal output', () => {
      const result = stripAnsi(formatResultDetail(multiStepCheckResult, 'terminal'))
      expect(result).toMatchSnapshot('multistep-result-detail-terminal')
    })

    it('includes errors, job log, and assets in terminal', () => {
      const result = stripAnsi(formatResultDetail(multiStepCheckResult, 'terminal'))
      expect(result).toContain('MULTI-STEP RESULT')
      expect(result).toContain('ERRORS')
      expect(result).toContain('Payment step failed')
      expect(result).toContain('JOB LOG')
      expect(result).toContain('ASSETS')
    })
  })

  describe('Agentic check result', () => {
    it('renders terminal output', () => {
      const result = stripAnsi(formatResultDetail(agenticCheckResult, 'terminal'))
      expect(result).toMatchSnapshot('agentic-result-detail-terminal')
    })

    it('renders markdown output', () => {
      const result = formatResultDetail(agenticCheckResult, 'md')
      expect(result).toMatchSnapshot('agentic-result-detail-md')
    })

    it('includes summary, assertions, steps, and suggestions sections in terminal', () => {
      const result = stripAnsi(formatResultDetail(agenticCheckResult, 'terminal'))
      expect(result).toContain('AGENTIC RESULT')
      expect(result).toContain('SUMMARY')
      expect(result).toContain('The homepage loaded successfully')
      expect(result).toContain('ASSERTIONS')
      expect(result).toContain('The homepage returns an HTTP 200 status')
      expect(result).toContain('STEPS')
      expect(result).toContain('http_request')
      expect(result).toContain('SUGGESTIONS')
      expect(result).toContain('Also verify the pricing page loads')
    })

    it('does not render Model, Cost, or Tokens in terminal output', () => {
      // These fields live in the runner's raw metadata but are intentionally
      // withheld from the public API response. The CLI mirrors that policy —
      // adding them back later is backwards-compatible, removing them after
      // they've been shown to users is not.
      const result = stripAnsi(formatResultDetail(agenticCheckResult, 'terminal'))
      expect(result).not.toContain('Model:')
      expect(result).not.toContain('Cost:')
      expect(result).not.toContain('Tokens:')
    })

    it('renders assertion failures with expected/actual context in terminal', () => {
      const result = stripAnsi(formatResultDetail(agenticCheckResultWithFailures, 'terminal'))
      expect(result).toContain('ASSERTIONS')
      expect(result).toContain('The homepage returns an HTTP 200 status')
      expect(result).toContain('expected "200"')
      expect(result).toContain('got "503"')
      expect(result).toContain('ERRORS')
      expect(result).toContain('503 Service Unavailable')
    })

    it('renders cleanly when metadata is empty-but-structured', () => {
      // A check that has only produced the envelope (no assertions/steps/
      // suggestions yet) should still render the AGENTIC RESULT header
      // without crashing and without any of the optional sections.
      const result = stripAnsi(formatResultDetail(agenticCheckResultMinimal, 'terminal'))
      expect(result).toContain('AGENTIC RESULT')
      expect(result).not.toContain('SUMMARY')
      expect(result).not.toContain('ASSERTIONS')
      expect(result).not.toContain('STEPS')
      expect(result).not.toContain('SUGGESTIONS')
      expect(result).not.toContain('ERRORS')
    })

    it('renders markdown tables for assertions', () => {
      const result = formatResultDetail(agenticCheckResult, 'md')
      expect(result).toContain('## Agentic Result')
      expect(result).toContain('### Summary')
      expect(result).toContain('### Assertions')
      expect(result).toContain('| Status | Condition | Expected | Actual |')
      expect(result).toContain('### Suggestions')
      expect(result).toContain('### Steps')
    })
  })

  describe('Retry attempts', () => {
    const baseRow = (overrides: Partial<CheckResult>): CheckResult => ({
      id: 'r',
      checkId: 'check-1',
      name: 'Login flow',
      hasFailures: false,
      hasErrors: false,
      isDegraded: null,
      overMaxResponseTime: null,
      runLocation: 'eu-west-1',
      startedAt: '2025-06-15T12:00:00.000Z',
      stoppedAt: '2025-06-15T12:00:04.000Z',
      created_at: '2025-06-15T12:00:04.000Z',
      responseTime: 4000,
      checkRunId: 1,
      attempts: 0,
      resultType: 'FINAL',
      sequenceId: 'seq-1',
      ...overrides,
    })

    describe('groupAttemptsBySequence', () => {
      it('keeps only matching sequenceId, ordered oldest-first', () => {
        const rows = [
          baseRow({ id: 'final', resultType: 'FINAL', startedAt: '2025-06-15T12:00:08.000Z' }),
          baseRow({ id: 'attempt-1', resultType: 'ATTEMPT', startedAt: '2025-06-15T12:00:00.000Z' }),
          baseRow({ id: 'other-seq', sequenceId: 'seq-2', startedAt: '2025-06-15T12:00:02.000Z' }),
          baseRow({ id: 'attempt-2', resultType: 'ATTEMPT', startedAt: '2025-06-15T12:00:04.000Z' }),
        ]
        const grouped = groupAttemptsBySequence(rows, 'seq-1')
        expect(grouped.map(r => r.id)).toEqual(['attempt-1', 'attempt-2', 'final'])
      })

      it('returns an empty array when no rows match', () => {
        expect(groupAttemptsBySequence([baseRow({ sequenceId: 'seq-9' })], 'seq-1')).toEqual([])
      })
    })

    describe('extractResultErrorSummary', () => {
      it('prefers an API requestError', () => {
        const row = baseRow({ apiCheckResult: { requestError: 'connect ECONNREFUSED' } as any })
        expect(extractResultErrorSummary(row)).toBe('connect ECONNREFUSED')
      })

      it('falls back to the first browser error', () => {
        const row = baseRow({ browserCheckResult: { errors: ['Timeout 30000ms exceeded'] } as any })
        expect(extractResultErrorSummary(row)).toBe('Timeout 30000ms exceeded')
      })

      it('reads agentic error messages', () => {
        const row = baseRow({
          agenticCheckResult: { errors: [{ error: { message: '503 Service Unavailable' } }] } as any,
        })
        expect(extractResultErrorSummary(row)).toBe('503 Service Unavailable')
      })

      it('falls back to status flags when no message is present', () => {
        expect(extractResultErrorSummary(baseRow({ hasFailures: true }))).toBe('failed')
        expect(extractResultErrorSummary(baseRow({ hasErrors: true }))).toBe('error')
      })

      it('returns an empty string for a clean result', () => {
        expect(extractResultErrorSummary(baseRow({}))).toBe('')
      })
    })

    describe('formatAttemptsSection', () => {
      const sequence = [
        baseRow({
          id: 'attempt-1',
          resultType: 'ATTEMPT',
          hasFailures: true,
          responseTime: 3900,
          startedAt: '2025-06-15T12:00:00.000Z',
          browserCheckResult: { errors: ['Timeout 30000ms exceeded'] } as any,
        }),
        baseRow({
          id: 'attempt-2',
          resultType: 'ATTEMPT',
          hasFailures: true,
          responseTime: 4000,
          startedAt: '2025-06-15T12:00:05.000Z',
          browserCheckResult: { errors: ['Timeout 30000ms exceeded'] } as any,
        }),
        baseRow({
          id: 'final',
          resultType: 'FINAL',
          responseTime: 4200,
          startedAt: '2025-06-15T12:00:10.000Z',
        }),
      ]

      it('renders a terminal table with run numbers, statuses, and a final marker', () => {
        const out = stripAnsi(formatAttemptsSection(sequence, 'terminal', { finalId: 'final' }))
        expect(out).toContain('ATTEMPTS')
        expect(out).toContain('1')
        expect(out).toContain('2')
        expect(out).toContain('3 (FINAL)')
        expect(out).toContain('failing')
        expect(out).toContain('passing')
        expect(out).toContain('Timeout 30000ms exceeded')
        expect(out).toContain('eu-west-1')
      })

      it('renders a markdown table with a (final) marker', () => {
        const out = formatAttemptsSection(sequence, 'md', { finalId: 'final' })
        expect(out).toContain('## Attempts')
        expect(out).toContain('3 (FINAL)')
        expect(out).toContain('Timeout 30000ms exceeded')
        expect(out).toContain('—')
      })

      it('returns an empty string for no attempts', () => {
        expect(formatAttemptsSection([], 'terminal')).toBe('')
      })
    })
  })

  describe('Minimal result (no sub-result)', () => {
    it('renders only top-level fields in terminal', () => {
      const result = stripAnsi(formatResultDetail(minimalCheckResult, 'terminal'))
      expect(result).toContain('Heartbeat Check')
      expect(result).toContain('passing')
      expect(result).toContain('eu-west-1')
      expect(result).toContain('50ms')
      expect(result).not.toContain('REQUEST')
      expect(result).not.toContain('BROWSER RESULT')
      expect(result).not.toContain('MULTI-STEP RESULT')
    })

    it('renders only top-level fields in markdown', () => {
      const result = formatResultDetail(minimalCheckResult, 'md')
      expect(result).toContain('# Heartbeat Check')
      expect(result).toContain('passing')
      expect(result).not.toContain('## Request')
      expect(result).not.toContain('## Browser')
    })
  })

  describe('Traceroute check result', () => {
    it('renders terminal snapshot', () => {
      const result = stripAnsi(formatResultDetail(tracerouteCheckResult, 'terminal'))
      expect(result).toMatchSnapshot('traceroute-result-detail-terminal')
    })

    it('renders markdown snapshot', () => {
      const result = formatResultDetail(tracerouteCheckResult, 'md')
      expect(result).toMatchSnapshot('traceroute-result-detail-md')
    })

    it('surfaces the diagnostic block for a failed run (terminal)', () => {
      const result = stripAnsi(formatResultDetail(tracerouteCheckResult, 'terminal'))
      expect(result).toContain('TRACEROUTE RESULT')
      expect(result).toContain('unreachable.example.com')
      expect(result).toContain('203.0.113.10')
      expect(result).toContain('Hops:')
      expect(result).toContain('30')
      expect(result).toContain('Reached:')
      expect(result).toContain('no')
      expect(result).toContain('max-hops')
      expect(result).toContain('HOPS')
      expect(result).toContain('gateway.local')
      expect(result).toContain('loss 100%')
    })

    it('surfaces the diagnostic block in markdown', () => {
      const result = formatResultDetail(tracerouteCheckResult, 'md')
      expect(result).toContain('## Traceroute Result')
      expect(result).toContain('**Hops:** 30')
      expect(result).toContain('**Truncated:** max-hops')
    })

    it('renders the assertions section (terminal)', () => {
      const result = stripAnsi(formatResultDetail(tracerouteCheckResult, 'terminal'))
      expect(result).toContain('ASSERTIONS')
      expect(result).toContain(`${FAIL} latency property "avg" is less than target "20". Received: 24.1.`)
      expect(result).toContain(`${PASS} response time is less than target "5000". Received: 1000.`)
    })

    it('renders the assertions section (markdown)', () => {
      const result = formatResultDetail(tracerouteCheckResult, 'md')
      expect(result).toContain('## Assertions')
      expect(result).toContain(`- ${FAIL} latency property "avg" is less than target "20". Received: 24.1.`)
      expect(result).toContain(`- ${PASS} response time is less than target "5000". Received: 1000.`)
      // Markdown must stay ANSI-free.
      expect(result).toBe(stripAnsi(result))
    })

    it('renders the probe protocol and DNS timing (terminal)', () => {
      const result = stripAnsi(formatResultDetail(tracerouteCheckResult, 'terminal'))
      expect(result).toContain('Probe protocol:')
      expect(result).toContain('ICMP')
      expect(result).toContain('TIMING')
      expect(result).toContain('DNS:')
    })

    it('renders the probe protocol and DNS timing (markdown)', () => {
      const result = formatResultDetail(tracerouteCheckResult, 'md')
      expect(result).toContain('**Probe protocol:** ICMP')
      expect(result).toContain('## Timing')
      expect(result).toContain('- **DNS:**')
    })
  })

  describe('gRPC check result', () => {
    it('renders terminal snapshot', () => {
      const result = stripAnsi(formatResultDetail(grpcCheckResult, 'terminal'))
      expect(result).toMatchSnapshot('grpc-result-detail-terminal')
    })

    it('renders markdown snapshot', () => {
      const result = formatResultDetail(grpcCheckResult, 'md')
      expect(result).toMatchSnapshot('grpc-result-detail-md')
    })

    it('surfaces the diagnostic block for a failed run (terminal)', () => {
      const result = stripAnsi(formatResultDetail(grpcCheckResult, 'terminal'))
      expect(result).toContain('GRPC RESULT')
      expect(result).toContain('grpc.example.com')
      expect(result).toContain('grpc.health.v1.Health/Check')
      expect(result).toContain('Status:')
      expect(result).toContain('14 connection refused')
      expect(result).toContain('Health:')
      expect(result).toContain('NOT_SERVING')
      expect(result).toContain('grpc.health.v1.Health/Watch')
      expect(result).toContain('content-type')
    })

    it('surfaces the diagnostic block in markdown', () => {
      const result = formatResultDetail(grpcCheckResult, 'md')
      expect(result).toContain('## gRPC Result')
      expect(result).toContain('**Status:** 14 connection refused')
      expect(result).toContain('**Health:** NOT_SERVING')
    })

    it('renders the assertions section with humanized sources (terminal)', () => {
      const result = stripAnsi(formatResultDetail(grpcCheckResult, 'terminal'))
      expect(result).toContain('ASSERTIONS')
      expect(result).toContain(`${FAIL} status code equals target "0". Received: 14.`)
      expect(result).toContain(`${PASS} health check status equals target "NOT_SERVING". Received: NOT_SERVING.`)
      expect(result).not.toContain('GRPC_STATUS_CODE')
    })

    it('renders the assertions section (markdown)', () => {
      const result = formatResultDetail(grpcCheckResult, 'md')
      expect(result).toContain('## Assertions')
      expect(result).toContain(`- ${FAIL} status code equals target "0". Received: 14.`)
      expect(result).toContain(`- ${PASS} health check status equals target "NOT_SERVING". Received: NOT_SERVING.`)
      expect(result).toBe(stripAnsi(result))
    })

    it('renders the gRPC timing breakdown (terminal + markdown)', () => {
      const term = stripAnsi(formatResultDetail(grpcCheckResult, 'terminal'))
      expect(term).toContain('TIMING')
      expect(term).toContain('DNS:')
      expect(term).toContain('Connect:')
      expect(term).toContain('Total:')
      const md = formatResultDetail(grpcCheckResult, 'md')
      expect(md).toContain('## Timing')
      expect(md).toContain('| Connect |')
      expect(md).toContain('| **Total** |')
    })

    it('renders Received for falsy actual values (0 / false)', () => {
      const base = grpcCheckResult.grpcCheckResult!
      const detail = {
        ...base,
        assertions: [
          { order: 0, source: 'GRPC_STATUS_CODE', property: '', comparison: 'GREATER_THAN', target: '5', regex: null, error: 'Expected 0 to be above 5', actual: 0 },
          { order: 1, source: 'GRPC_HEALTHCHECK_STATUS', property: '', comparison: 'EQUALS', target: 'true', regex: null, error: 'Expected false to equal true', actual: false },
        ],
      }
      const res = { ...grpcCheckResult, grpcCheckResult: detail }
      const result = stripAnsi(formatResultDetail(res, 'terminal'))
      expect(result).toContain('Received: 0.')
      expect(result).toContain('Received: false.')
    })
  })

  describe('SSL check result', () => {
    it('renders terminal snapshot', () => {
      const result = stripAnsi(formatResultDetail(sslCheckResult, 'terminal'))
      expect(result).toMatchSnapshot('ssl-result-detail-terminal')
    })

    it('renders markdown snapshot', () => {
      const result = formatResultDetail(sslCheckResult, 'md')
      expect(result).toMatchSnapshot('ssl-result-detail-md')
    })

    it('surfaces the diagnostic block for a failed run (terminal)', () => {
      const result = stripAnsi(formatResultDetail(sslCheckResult, 'terminal'))
      expect(result).toContain('SSL RESULT')
      expect(result).toContain('TLS 1.3')
      expect(result).toContain('TLS_AES_256_GCM_SHA384')
      expect(result).toContain('Expires in:')
      expect(result).toContain('expired 5 day(s) ago')
      expect(result).toContain('Chain trusted:')
      expect(result).toContain('Baseline:')
      expect(result).toContain('FAIL')
      expect(result).toContain('grade C')
      expect(result).toContain('Failure:')
      expect(result).toContain('expired')
    })

    it('surfaces the diagnostic block in markdown', () => {
      const result = formatResultDetail(sslCheckResult, 'md')
      expect(result).toContain('## SSL Result')
      expect(result).toContain('**Expires in:** expired 5 day(s) ago')
      expect(result).toContain('**Failure:** expired')
    })

    it('renders the assertions section with the failure reason (terminal)', () => {
      const result = stripAnsi(formatResultDetail(sslCheckResult, 'terminal'))
      expect(result).toContain('ASSERTIONS')
      expect(result).toContain(`${FAIL} CERT_EXPIRES_IN_DAYS is greater than target "99999". Received: 52.`)
      expect(result).toContain(`${PASS} CERT_NOT_EXPIRED equals target "true". Received: true.`)
    })

    it('renders the assertions section (markdown)', () => {
      const result = formatResultDetail(sslCheckResult, 'md')
      expect(result).toContain('## Assertions')
      expect(result).toContain(`- ${FAIL} CERT_EXPIRES_IN_DAYS is greater than target "99999". Received: 52.`)
      expect(result).toContain(`- ${PASS} CERT_NOT_EXPIRED equals target "true". Received: true.`)
      expect(result).toBe(stripAnsi(result))
    })

    it('renders the certificate section (terminal)', () => {
      const result = stripAnsi(formatResultDetail(sslCheckResult, 'terminal'))
      expect(result).toContain('CERTIFICATE')
      expect(result).toContain('Subject CN:')
      expect(result).toContain('expired.example.com')
      expect(result).toContain('Issuer CN:')
      expect(result).toContain('Example Issuing CA')
      expect(result).toContain('Valid:')
      expect(result).toContain('2026-01-01T00:00:00Z → 2026-07-01T00:00:00Z')
      expect(result).toContain('Key:')
      expect(result).toContain('ECDSA 256-bit')
      expect(result).toContain('Signature:')
      expect(result).toContain('ECDSA-SHA256')
      expect(result).toContain('SHA-256:')
      expect(result).toContain('beab14cf39678fda0ef1606eedb818c2298ba2cc7a00886e7dc2d2410f24cd35')
      expect(result).toContain('SANs:')
      expect(result).toContain('www.expired.example.com')
      expect(result).toContain('OCSP stapled:')
    })

    it('renders the certificate section (markdown)', () => {
      const result = formatResultDetail(sslCheckResult, 'md')
      expect(result).toContain('## Certificate')
      expect(result).toContain('- **Subject CN:** expired.example.com')
      expect(result).toContain('- **Issuer CN:** Example Issuing CA')
      expect(result).toContain('- **Valid:** 2026-01-01T00:00:00Z → 2026-07-01T00:00:00Z')
      expect(result).toContain('- **Key:** ECDSA 256-bit')
      expect(result).toContain('- **SHA-256:** `beab14cf39678fda0ef1606eedb818c2298ba2cc7a00886e7dc2d2410f24cd35`')
      expect(result).toContain('- **OCSP stapled:** no')
      expect(result).toBe(stripAnsi(result))
    })

    it('renders the per-rule security baseline (terminal)', () => {
      const result = stripAnsi(formatResultDetail(sslCheckResult, 'terminal'))
      expect(result).toContain('SECURITY BASELINE')
      expect(result).toContain(`${PASS} min TLS version (fail)`)
      expect(result).toContain(`${FAIL} weak cipher suite (fail)`)
      expect(result).toContain(`${PASS} recommended TLS version (ignore)`)
      // The one-line summary is still present in the RESULT block.
      expect(result).toContain('Baseline:')
    })

    it('renders the per-rule security baseline (markdown)', () => {
      const result = formatResultDetail(sslCheckResult, 'md')
      expect(result).toContain('## Security Baseline')
      expect(result).toContain(`- ${PASS} min TLS version (fail)`)
      expect(result).toContain(`- ${FAIL} weak cipher suite (fail)`)
      expect(result).toContain(`- ${PASS} SCT present (ignore)`)
      expect(result).toBe(stripAnsi(result))
    })

    it('caps SANs with a +N more suffix', () => {
      const base = sslCheckResult.sslCheckResult!
      const detail = {
        ...base,
        response: {
          ...base.response,
          certificate: {
            ...(base.response!.certificate as Record<string, unknown>),
            sans: Array.from({ length: 13 }, (_, i) => `alt${i}.example.com`),
          },
        },
      }
      const res = { ...sslCheckResult, sslCheckResult: detail }
      const result = stripAnsi(formatResultDetail(res, 'terminal'))
      expect(result).toContain('alt0.example.com')
      expect(result).toContain('alt9.example.com')
      expect(result).toContain('+3 more')
      expect(result).not.toContain('alt10.example.com')
    })

    it('renders self-signed and CA flags when set', () => {
      const base = sslCheckResult.sslCheckResult!
      const detail = {
        ...base,
        response: {
          ...base.response,
          certificate: {
            ...(base.response!.certificate as Record<string, unknown>),
            selfSigned: true,
            isCA: true,
          },
        },
      }
      const res = { ...sslCheckResult, sslCheckResult: detail }
      const result = stripAnsi(formatResultDetail(res, 'terminal'))
      expect(result).toContain('Self-signed:')
      expect(result).toContain('CA:')
    })

    it('renders a scalar baseline rule as key: value', () => {
      const base = sslCheckResult.sslCheckResult!
      const detail = {
        ...base,
        response: {
          ...base.response,
          securityBaseline: {
            ...(base.response!.securityBaseline as Record<string, unknown>),
            minTLSVersion: 'TLS1.2',
          },
        },
      }
      const res = { ...sslCheckResult, sslCheckResult: detail }
      const term = stripAnsi(formatResultDetail(res, 'terminal'))
      expect(term).toContain('min TLS version: TLS1.2')
      const md = formatResultDetail(res, 'md')
      expect(md).toContain('min TLS version: TLS1.2')
      expect(md).toBe(stripAnsi(md))
    })
  })
})
