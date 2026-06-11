import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stripAnsi } from '../render.js'
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
})
