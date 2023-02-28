import * as indentString from 'indent-string'

import AbstractListReporter from './abstract-list'
import { formatCheckTitle, formatCheckResult, CheckStatus } from './util'

export default class ListReporter extends AbstractListReporter {
  onBeginStatic () {
    console.log('\nListing all checks:\n')
    this._printSummary({ skipCheckCount: true })
  }

  onBegin () {
    console.log(`\nRunning ${this.numChecks} checks in ${this._runLocationString()}.\n`)
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
    }
    if (this.verbose || checkResult.hasFailures) {
      console.log('')
      console.log(indentString(formatCheckResult(checkResult), 4))
      console.log('')
    }
    this._printSummary()
  }

  onError (err: Error) {
    this._clearSummary()
    super.onError(err)
  }
}
