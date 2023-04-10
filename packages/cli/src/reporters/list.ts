import * as indentString from 'indent-string'
import * as chalk from 'chalk'

import AbstractListReporter from './abstract-list'
import { formatCheckTitle, formatCheckResult, CheckStatus, printLn, getTestSessionUrl, getTraceUrl } from './util'

export default class ListReporter extends AbstractListReporter {
  onBeginStatic () {
    printLn('Listing all checks:', 2, 1)
    this._printSummary({ skipCheckCount: true })
  }

  onBegin (testSessionId?: string, testResultIds?: { [key: string]: string }) {
    this._setTestSessionId(testSessionId)
    this._setTestResultIds(testResultIds)
    printLn(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2, 1)
    this._printSummary()
  }

  onEnd () {
    this._clearSummary()
    this._printSummary()
    this._printTestSessionsUrl()
  }

  onCheckEnd (checkResult: any) {
    super.onCheckEnd(checkResult)
    this._clearSummary()

    if (this.verbose) {
      printLn(formatCheckTitle(checkResult.hasFailures ? CheckStatus.FAILED : CheckStatus.SUCCESSFUL, checkResult))
      printLn(indentString(formatCheckResult(checkResult), 4), 2, 1)
    } else {
      if (checkResult.hasFailures) {
        printLn(formatCheckTitle(CheckStatus.FAILED, checkResult))
        printLn(indentString(formatCheckResult(checkResult), 4), 2, 1)
      }
    }

    if (checkResult.hasFailures) {
      if (checkResult.traceFilesUrls) {
        // TODO: print all video files URLs
        printLn(indentString(
          'View trace : ' + chalk.underline.cyan(
            getTraceUrl(checkResult.traceFilesUrls[0]))
          , 4,
        ))
      }
      if (checkResult.videoFilesUrls) {
        // TODO: print all trace files URLs
        printLn(indentString(
          'View video : ' + chalk.underline.cyan(
            `${checkResult.videoFilesUrls[0]}`)
          , 4,
        ))
      }
      if (this.testResultIds && this.testSessionId) {
        printLn(indentString(
          'View result: ' + chalk.underline.cyan(`${getTestSessionUrl(this.testSessionId)}/results/${this.testResultIds[checkResult.logicalId]}`)
          , 4,
        ), 2)
      }
    }

    this._printSummary()
  }

  onError (err: Error) {
    this._clearSummary()
    super.onError(err)
  }
}
