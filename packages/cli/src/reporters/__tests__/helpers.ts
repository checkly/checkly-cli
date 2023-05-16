import { checkFilesMap } from '../abstract-list'
import { browserCheckResult } from './fixtures/browser-check-result'
import { apiCheckResult } from './fixtures/api-check-result'

export function generateMapAndTestResultIds ({ includeTestResultIds = true }) {
  const checkFilesMapFixture: checkFilesMap = new Map([
    ['folder/browser.check.ts', new Map([
      [browserCheckResult.checkRunId, {
        result: browserCheckResult as any,
        titleString: browserCheckResult.name,
        // TODO: We shouldn't reuse the checkRunId as the testResultId in the test. This isn't how it actually works.
        testResultId: includeTestResultIds ? browserCheckResult.checkRunId : undefined,
      }],
    ])],
    ['folder/api.check.ts', new Map([
      [apiCheckResult.checkRunId, {
        result: apiCheckResult as any,
        titleString: apiCheckResult.name,
        testResultId: includeTestResultIds ? apiCheckResult.checkRunId : undefined,
      }],
    ])],
  ])

  return checkFilesMapFixture
}
