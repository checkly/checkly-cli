import * as indentString from 'indent-string'

import AbstractListReporter from './abstract-list'
import { formatCheckTitle, formatCheckResult, CheckStatus, stdOutWriteLn } from './util'

export default class CiReporter extends AbstractListReporter {
  onBeginStatic () {
    stdOutWriteLn('Listing all checks:', 2, 1)
    this._printSummary({ skipCheckCount: true })
  }

  onBegin () {
    stdOutWriteLn(`Running ${this.numChecks} checks in ${this._runLocationString()}:`, 2, 1)
    this._printSummary({ skipCheckCount: true })
  }

  onEnd () {
    stdOutWriteLn('Finished running all checks:', 2)
    this._printSummary()
  }

  onCheckEnd (checkResult: any) {
    super.onCheckEnd(checkResult)
    stdOutWriteLn(formatCheckTitle(checkResult.hasFailures ? CheckStatus.FAILED : CheckStatus.SUCCESSFUL, checkResult))

    if (this.verbose || checkResult.hasFailures) {
      stdOutWriteLn(indentString(formatCheckResult(checkResult), 4), 2, 1)
    }
  }
}
