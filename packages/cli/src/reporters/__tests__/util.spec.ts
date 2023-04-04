import { formatCheckTitle, formatCheckResult, CheckStatus } from '../util'
import { simpleCheckFixture } from './fixtures/simple-check'
import { apiCheckResult } from './fixtures/api-check-result'
import { browserCheckResult } from './fixtures/browser-check-result'
import { Settings } from 'luxon'

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
  it('should print a pending check title', () => {
    expect(stripAnsi(formatCheckTitle(CheckStatus.PENDING, simpleCheckFixture, { includeSourceFile: true })))
      .toMatchSnapshot('pending-check-title')
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
})
