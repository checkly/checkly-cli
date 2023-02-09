import * as indentString from 'indent-string'

import AbstractListReporter from './abstract-list'
import { formatCheckTitle, formatCheckResult, CheckStatus } from './util'

export default class CiReporter extends AbstractListReporter {
  onBeginStatic () {
    console.log('\nListing all checks:\n')
    this._printSummary({ skipCheckCount: true })
  }

  onBegin () {
    console.log(`\nRunning ${this.numChecks} checks in ${this._runLocationString()}:\n`)
    this._printSummary({ skipCheckCount: true })
  }

  onEnd () {
    console.log('Finished running all checks:\n')
    this._printSummary()
  }

  onCheckEnd (checkResult: any) {
    super.onCheckEnd(checkResult)
    console.log(formatCheckTitle(checkResult.hasFailures ? CheckStatus.FAILED : CheckStatus.SUCCESSFUL, checkResult))

    if (this.verbose || checkResult.hasFailures) {
      console.log('')
      console.log(indentString(formatCheckResult(checkResult), 4))
      console.log('')
    }
  }
}
