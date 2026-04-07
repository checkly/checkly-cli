import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stripAnsi } from '../render'
import { formatResultDetail } from '../check-result-detail'
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
} from './__fixtures__/fixtures'

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
