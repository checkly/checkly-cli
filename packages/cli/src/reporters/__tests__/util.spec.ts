import { Settings } from 'luxon'
import { describe, it, expect, beforeAll } from 'vitest'

import { formatCheckTitle, formatCheckResult, CheckStatus, resultToCheckStatus } from '../util'
import { simpleCheckFixture } from './fixtures/simple-check'
import { apiCheckResult } from './fixtures/api-check-result'
import { browserCheckResult } from './fixtures/browser-check-result'
import { agenticCheckResult, agenticCheckResultWithFailures } from './fixtures/agentic-check-result'

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
    expect(stripAnsi(formatCheckTitle(CheckStatus.FAILED, simpleCheckFixture, { includeSourceFile: true })))
      .toMatchSnapshot('failed-check-title')
  })
  it('should print a passed check title', () => {
    expect(stripAnsi(formatCheckTitle(CheckStatus.SUCCESSFUL, simpleCheckFixture, { includeSourceFile: true })))
      .toMatchSnapshot('passed-check-title')
  })
  it('should print a degraded check title', () => {
    expect(stripAnsi(formatCheckTitle(CheckStatus.DEGRADED, simpleCheckFixture, { includeSourceFile: true })))
      .toMatchSnapshot('degraded-check-title')
  })
  it('should print a running check title', () => {
    expect(stripAnsi(formatCheckTitle(CheckStatus.RUNNING, simpleCheckFixture, { includeSourceFile: true })))
      .toMatchSnapshot('running-check-title')
  })
  it('should print a scheduling check title', () => {
    expect(stripAnsi(formatCheckTitle(CheckStatus.SCHEDULING, simpleCheckFixture, { includeSourceFile: true })))
      .toMatchSnapshot('scheduling-check-title')
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
})
