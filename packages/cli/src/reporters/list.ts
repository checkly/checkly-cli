import indentString from 'indent-string'
import chalk from 'chalk'

import AbstractListReporter from './abstract-list'
import { SequenceId } from '../services/abstract-check-runner'
import { formatCheckTitle, formatCheckResult, CheckStatus, printLn } from './util'
import { TestResultsShortLinks } from '../rest/test-sessions'

export default class ListReporter extends AbstractListReporter {
  onBegin (checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId?: string) {
    super.onBegin(checks, testSessionId)
    printLn(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2, 1)
    this._printSummary()
  }

  onCheckInProgress (check: any, sequenceId: SequenceId) {
    super.onCheckInProgress(check, sequenceId)
    this._clearSummary()
    this._printSummary()
  }

  onSchedulingDelayExceeded () {
    super.onSchedulingDelayExceeded()
    this._clearSummary()
    this._printSummary()
  }

  onEnd () {
    this._clearSummary()
    this._printSummary()
    this._printTestSessionsUrl()
  }

  onCheckAttemptResult (sequenceId: string, checkResult: any, links?: TestResultsShortLinks): void {
    super.onCheckAttemptResult(sequenceId, checkResult)
    this._clearSummary()

    printLn(formatCheckTitle(CheckStatus.RETRIED, checkResult, { printRetryDuration: true }))
    printLn(indentString(formatCheckResult(checkResult), 4), 2, 1)
    if (links) {
      printLn(indentString('View result: ' + chalk.underline.cyan(`${links.testResultLink}`), 4))
      if (links.testTraceLinks?.length) {
        // TODO: print all video files URLs
        printLn(indentString('View trace : ' + chalk.underline.cyan(links.testTraceLinks.join(', ')), 4))
      }
      if (links.videoLinks?.length) {
        // TODO: print all trace files URLs
        printLn(indentString('View video : ' + chalk.underline.cyan(`${links.videoLinks.join(', ')}`), 4))
      }
      printLn('')
    }

    this._printSummary()
  }

  onCheckEnd (sequenceId: SequenceId, checkResult: any, links?: TestResultsShortLinks) {
    super.onCheckEnd(sequenceId, checkResult)
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

    if (links) {
      printLn(indentString('View result: ' + chalk.underline.cyan(`${links.testResultLink}`), 4))
      if (links.testTraceLinks?.length) {
        // TODO: print all video files URLs
        printLn(indentString('View trace : ' + chalk.underline.cyan(links.testTraceLinks.join(', ')), 4))
      }
      if (links.videoLinks?.length) {
        // TODO: print all trace files URLs
        printLn(indentString('View video : ' + chalk.underline.cyan(`${links.videoLinks.join(', ')}`), 4))
      }
      printLn('')
    }

    this._printSummary()
  }

  onError (err: Error) {
    this._clearSummary()
    super.onError(err)
  }
}
