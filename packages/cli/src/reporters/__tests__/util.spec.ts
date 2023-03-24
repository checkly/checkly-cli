import { formatCheckTitle, formatCheckResult, CheckStatus } from '../util'
import { simpleCheckFixture } from './fixtures/simple-check'
import { apiCheckResult } from './fixtures/api-check-result'
import { browserCheckResult } from './fixtures/browser-check-result'

describe('formatCheckTitle()', () => {
  it('should print a failed check title', () => {
    expect(formatCheckTitle(CheckStatus.FAILED, simpleCheckFixture, { includeSourceFile: true })).toMatchSnapshot('failed-check-title')
  })
  it('should print a passed check title', () => {
    expect(formatCheckTitle(CheckStatus.SUCCESSFUL, simpleCheckFixture, { includeSourceFile: true })).toMatchSnapshot('passed-check-title')
  })
  it('should print a pending check title', () => {
    expect(formatCheckTitle(CheckStatus.PENDING, simpleCheckFixture, { includeSourceFile: true })).toMatchSnapshot('pending-check-title')
  })
})

describe('formatCheckResult()', () => {
  describe('API Check result', () => {
    it('formats a basic API Check result ', () => {
      const basicApiCheckResult = { ...apiCheckResult }
      basicApiCheckResult.checkRunData.assertions = []
      basicApiCheckResult.logs.setup = []
      basicApiCheckResult.logs.teardown = []
      expect(formatCheckResult(apiCheckResult)).toMatchSnapshot('api-check-result-basic-format')
    })
    it('formats an API Check result with assertions', () => {
      const basicApiCheckResult = { ...apiCheckResult }
      basicApiCheckResult.logs.setup = []
      basicApiCheckResult.logs.teardown = []
      expect(formatCheckResult(apiCheckResult)).toMatchSnapshot('api-check-result-assertions-format')
    })
    it('formats an API Check result with setup & teardown logs', () => {
      const basicApiCheckResult = { ...apiCheckResult }
      basicApiCheckResult.checkRunData.assertions = []
      expect(formatCheckResult(apiCheckResult)).toMatchSnapshot('api-check-result-logs-format')
    })
  })
  describe('Browser Check result', () => {
    it('formats a basic Browser Check result ', () => {
      const basicBrowserCheckResult = { ...browserCheckResult }
      basicBrowserCheckResult.logs = []
      expect(formatCheckResult(basicBrowserCheckResult)).toMatchSnapshot('browser-check-result-basic-format')
    })
    it('formats a Browser Check result with logs', () => {
      expect(formatCheckResult(browserCheckResult)).toMatchSnapshot('browser-check-result-logs-format')
    })
  })
})
