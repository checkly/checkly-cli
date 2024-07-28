import { checkFilesMap } from '../abstract-list'
import { browserCheckResult } from './fixtures/browser-check-result'
import { apiCheckResult } from './fixtures/api-check-result'
import { SequenceId } from '../../services/abstract-check-runner'

export function generateMapAndTestResultIds ({ includeTestResultIds = true, includeRunErrors = false }) {
  if (includeRunErrors) {
    browserCheckResult.runError = 'Run error'
    apiCheckResult.runError = 'Run error'
  }
  const checkFilesMapFixture: checkFilesMap = new Map([
    ['folder/browser.check.ts', new Map([
      [browserCheckResult.sourceInfo.sequenceId as SequenceId, {
        result: browserCheckResult as any,
        titleString: browserCheckResult.name,
        // TODO: We shouldn't reuse the checkRunId as the testResultId in the test. This isn't how it actually works.
        testResultId: includeTestResultIds ? browserCheckResult.checkRunId : undefined,
        numRetries: 0,
        links: includeTestResultIds
          ? {
              testResultLink: 'https://app.checklyhq.com/test-sessions/0c4c64b3-79c5-44a6-ae07-b580ce73f328/results/702961fd-7e2c-45f0-97be-1aa9eabd4d82',
              testTraceLinks: [],
              videoLinks: [],
              screenshotLinks: [],
            }
          : undefined,
      }],
    ])],
    ['folder/api.check.ts', new Map([
      [apiCheckResult.sourceInfo.sequenceId as SequenceId, {
        result: apiCheckResult as any,
        titleString: apiCheckResult.name,
        testResultId: includeTestResultIds ? apiCheckResult.checkRunId : undefined,
        numRetries: 0,
        links: includeTestResultIds
          ? {
              testResultLink: 'https://app.checklyhq.com/test-sessions/0c4c64b3-79c5-44a6-ae07-b580ce73f328/results/1c0be612-a5ec-432e-ac1c-837d2f70c010',
              testTraceLinks: [],
              videoLinks: [],
              screenshotLinks: [],
            }
          : undefined,
      }],
    ])],
  ])

  return checkFilesMapFixture
}
