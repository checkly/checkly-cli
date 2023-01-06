import * as indentString from 'indent-string'

import AbstractListReporter from './abstract-list'
import { formatCheckTitle, formatCheckResult, CheckStatus } from './util'

export default class CiReporter extends AbstractListReporter {
  onBegin () {
    console.log(`\nRunning ${this.numChecks} checks in ${this.runLocation}:\n`)
    this._printSummary({ skipCheckCount: true })
  }

  onEnd () {
    console.log('Finished running all checks:\n')
    this._printSummary()
  }

  onCheckEnd (checkResult: any) {
    super.onCheckEnd(checkResult)
    if (checkResult.hasFailures) {
      console.log(formatCheckTitle(CheckStatus.FAILED, checkResult))
      console.log('')
      console.log(indentString(formatCheckResult(checkResult), 4))
      console.log('')
    } else {
      console.log(formatCheckTitle(CheckStatus.SUCCESSFUL, checkResult))
    }
  }
}
