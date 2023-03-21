import * as indentString from 'indent-string'

import AbstractListReporter from './abstract-list'
import { formatCheckTitle, formatCheckResult, CheckStatus, printLn } from './util'

export default class CiReporter extends AbstractListReporter {
  onBeginStatic () {
    printLn('Listing all checks:', 2, 1)
    this._printSummary({ skipCheckCount: true })
  }

  onBegin () {
    printLn(`Running ${this.numChecks} checks in ${this._runLocationString()}:`, 2, 1)
    this._printSummary({ skipCheckCount: true })
  }

  onEnd () {
    printLn('Finished running all checks:', 2)
    this._printSummary()
  }

  onCheckEnd (checkResult: any) {
    super.onCheckEnd(checkResult)
    printLn(formatCheckTitle(checkResult.hasFailures ? CheckStatus.FAILED : CheckStatus.SUCCESSFUL, checkResult))

    if (this.verbose || checkResult.hasFailures) {
      printLn(indentString(formatCheckResult(checkResult), 4), 2, 1)
    }
  }
}
