import * as indentString from 'indent-string'

import AbstractListReporter from './abstract-list'
import { formatCheckTitle, formatCheckResult, CheckStatus, stdOutWriteLn } from './util'

export default class ListReporter extends AbstractListReporter {
  onBeginStatic () {
    stdOutWriteLn('Listing all checks:', 2, 1)
    this._printSummary({ skipCheckCount: true })
  }

  onBegin () {
    stdOutWriteLn(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2, 1)
    this._printSummary()
  }

  onEnd () {
    this._clearSummary()
    this._printSummary()
  }

  onCheckEnd (checkResult: any) {
    super.onCheckEnd(checkResult)
    this._clearSummary()
    if (checkResult.hasFailures) {
      // Print the failed check result above the status section
      stdOutWriteLn(formatCheckTitle(CheckStatus.FAILED, checkResult))
    }
    if (this.verbose || checkResult.hasFailures) {
      stdOutWriteLn('')
      stdOutWriteLn(indentString(formatCheckResult(checkResult), 4))
      stdOutWriteLn('')
    }
    this._printSummary()
  }
}
