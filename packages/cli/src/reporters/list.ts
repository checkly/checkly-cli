import * as indentString from 'indent-string'

import AbstractListReporter from './abstract-list'
import { formatCheckTitle, formatCheckResult, CheckStatus, printLn } from './util'

export default class ListReporter extends AbstractListReporter {
  onBeginStatic () {
    printLn('Listing all checks:', 2, 1)
    this._printSummary({ skipCheckCount: true })
  }

  onBegin () {
    printLn(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2, 1)
    this._printSummary()
  }

  onEnd (testSessionId?: string, testResultIds?: Record<string, string>[]) {
    this._clearSummary()
    this._printSummary()
    if (testSessionId) {
      this._printTestSessionsUrl(testSessionId, testResultIds)
    }
  }

  onCheckEnd (checkResult: any) {
    super.onCheckEnd(checkResult)
    this._clearSummary()
    if (checkResult.hasFailures) {
      // Print the failed check result above the status section
      printLn(formatCheckTitle(CheckStatus.FAILED, checkResult))
    }
    if (this.verbose || checkResult.hasFailures) {
      printLn(indentString(formatCheckResult(checkResult), 4), 2, 1)
    }
    this._printSummary()
  }

  onError (err: Error) {
    this._clearSummary()
    super.onError(err)
  }
}
