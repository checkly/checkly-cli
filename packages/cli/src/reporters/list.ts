import indentString from 'indent-string'
import chalk from 'chalk'

import AbstractListReporter from './abstract-list.js'
import { SequenceId } from '../services/abstract-check-runner.js'
import { formatCheckTitle, formatCheckResult, CheckStatus, printLn, printLnErr, resultToCheckStatus } from './util.js'
import { TestResultsShortLinks } from '../rest/test-sessions.js'

export default class ListReporter extends AbstractListReporter {
  onBegin (checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId?: string) {
    super.onBegin(checks, testSessionId)
    // "Running N checks" and the live summary are progress output: they go
    // to stderr so stdout carries only the results of the run.
    printLnErr(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2)
    this._printSummary({ stream: 'stderr' })
  }

  onCheckInProgress (check: any, sequenceId: SequenceId) {
    super.onCheckInProgress(check, sequenceId)
    this._clearSummary()
    this._printSummary({ stream: 'stderr' })
  }

  onSchedulingDelayExceeded () {
    super.onSchedulingDelayExceeded()
    this._clearSummary()
    this._printSummary({ stream: 'stderr' })
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
      printLn(indentString('View result: ' + chalk.underline.cyan(links.testResultLink), 4))
      if (links.testTraceLinks?.length) {
        // TODO: print all video files URLs
        printLn(indentString('View trace : ' + links.testTraceLinks.map(link => chalk.underline.cyan(link)).join(', '), 4))
      }
      if (links.videoLinks?.length) {
        // TODO: print all trace files URLs
        printLn(indentString('View video : ' + links.videoLinks.map(link => chalk.underline.cyan(link)).join(', '), 4))
      }
      printLn('')
    }

    this._printSummary({ stream: 'stderr' })
  }

  onCheckEnd (sequenceId: SequenceId, checkResult: any, testResultId?: string, links?: TestResultsShortLinks) {
    super.onCheckEnd(sequenceId, checkResult, testResultId, links)
    this._clearSummary()

    if (this.verbose) {
      printLn(formatCheckTitle(resultToCheckStatus(checkResult), checkResult))
      printLn(indentString(formatCheckResult(checkResult), 4), 2, 1)
    } else {
      if (checkResult.hasFailures) {
        printLn(formatCheckTitle(CheckStatus.FAILED, checkResult))
        printLn(indentString(formatCheckResult(checkResult), 4), 2, 1)
      }
      if (checkResult.isDegraded) {
        printLn(formatCheckTitle(CheckStatus.DEGRADED, checkResult))
        printLn(indentString(formatCheckResult(checkResult), 4), 2, 1)
      }
    }

    if (links) {
      printLn(indentString('View result: ' + chalk.underline.cyan(links.testResultLink), 4))
      if (links.testTraceLinks?.length) {
        // TODO: print all video files URLs
        printLn(indentString('View trace : ' + links.testTraceLinks.map(link => chalk.underline.cyan(link)).join(', '), 4))
      }
      if (links.videoLinks?.length) {
        // TODO: print all trace files URLs
        printLn(indentString('View video : ' + links.videoLinks.map(link => chalk.underline.cyan(link)).join(', '), 4))
      }
      printLn('')
    }

    this._printSummary({ stream: 'stderr' })
  }

  onError (err: Error) {
    this._clearSummary()
    super.onError(err)
  }
}
