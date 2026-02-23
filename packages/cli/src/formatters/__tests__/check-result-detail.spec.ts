import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stripAnsi } from '../render'
import { formatResultDetail } from '../check-result-detail'
import {
  apiCheckResult,
  apiCheckResultWithError,
  browserCheckResult,
  multiStepCheckResult,
  minimalCheckResult,
} from './fixtures'

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
