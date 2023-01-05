import * as indentString from 'indent-string'

import AbstractListReporter from './abstract-list'
import { formatCheckTitle, formatCheckResult, CheckStatus } from './util'

export default class ListReporter extends AbstractListReporter {
  onBegin () {
    console.log(`\nRunning ${this.numChecks} checks in ${this.runLocation}.\n`)
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
      console.log(formatCheckTitle(CheckStatus.FAILED, checkResult))
      console.log(indentString(formatCheckResult(checkResult), 4))
      console.log('\n')
    }
    this._printSummary()
  }
}
