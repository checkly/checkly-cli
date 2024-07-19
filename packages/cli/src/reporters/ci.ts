import indentString from 'indent-string'

import AbstractListReporter from './abstract-list'
import { formatCheckTitle, formatCheckResult, CheckStatus, printLn } from './util'
import { SequenceId } from '../services/abstract-check-runner'
import { TestResultsShortLinks } from '../rest/test-sessions'

export default class CiReporter extends AbstractListReporter {
  onBegin (checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId?: string) {
    super.onBegin(checks, testSessionId)
    printLn(`Running ${this.numChecks} checks in ${this._runLocationString()}:`, 2, 1)
    this._printSummary({ skipCheckCount: true })
  }

  onEnd () {
    printLn('Finished running all checks:', 2)
    this._printSummary()
    this._printTestSessionsUrl()
  }

  onCheckAttemptResult (sequenceId: string, checkResult: any, links?: TestResultsShortLinks): void {
    super.onCheckAttemptResult(sequenceId, checkResult, links)

    printLn(formatCheckTitle(CheckStatus.RETRIED, checkResult, { printRetryDuration: true }))
    printLn(indentString(formatCheckResult(checkResult), 4), 2, 1)
  }

  onCheckEnd (sequenceId: SequenceId, checkResult: any) {
    super.onCheckEnd(sequenceId, checkResult)
    printLn(formatCheckTitle(checkResult.hasFailures ? CheckStatus.FAILED : CheckStatus.SUCCESSFUL, checkResult))

    if (this.verbose || checkResult.hasFailures) {
      printLn(indentString(formatCheckResult(checkResult), 4), 2, 1)
    }
  }
}
