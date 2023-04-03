import { checkFilesMap } from '../abstract-list'
import { browserCheckResult } from './fixtures/browser-check-result'
import { apiCheckResult } from './fixtures/api-check-result'

export function generateMapAndTestResultIds () {
  const checkFilesMapFixture: checkFilesMap = new Map([
    ['folder/browser.check.ts', new Map([
      [browserCheckResult.logicalId, { result: browserCheckResult as any, titleString: browserCheckResult.name }],
    ])],
    ['folder/api.check.ts', new Map([
      [apiCheckResult.logicalId, { result: apiCheckResult as any, titleString: apiCheckResult.name }],
    ])],
  ])

  const testResultIdsFixture = {
    [browserCheckResult.logicalId]: browserCheckResult.checkRunId,
    [apiCheckResult.logicalId]: apiCheckResult.checkRunId,
  }
  return {
    checkFilesMap: checkFilesMapFixture,
    testResultIds: testResultIdsFixture,
  }
}
