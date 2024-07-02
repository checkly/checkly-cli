import chalk from 'chalk'
import indentString from 'indent-string'

import { TestResultsShortLinks } from '../rest/test-sessions'
import { Reporter } from './reporter'
import { CheckStatus, formatCheckTitle, getTestSessionUrl, printLn } from './util'
import type { SequenceId, RunLocation } from '../services/abstract-check-runner'
import { Check } from '../constructs/check'
import { testSessions } from '../rest/api'

// Map from file -> checkRunId -> check+result.
// This lets us print a structured list of the checks.
// Map remembers the original insertion order, so each time we print the summary will be consistent.
// Note that in the case of `checkly trigger`, the file will be `undefined`!
export type checkFilesMap = Map<string|undefined, Map<SequenceId, {
  check?: Check,
  result?: any,
  titleString: string,
  checkStatus?: CheckStatus,
  links?: TestResultsShortLinks,
}>>

export default abstract class AbstractListReporter implements Reporter {
  _clearString = ''
  runLocation: RunLocation
  checkFilesMap?: checkFilesMap
  numChecks?: number
  verbose: boolean
  testSessionId?: string
  _isSchedulingDelayExceeded?: boolean

  constructor (
    runLocation: RunLocation,
    verbose: boolean,
  ) {
    this.runLocation = runLocation
    this.verbose = verbose
  }

  onBegin (checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId?: string): void {
    this.testSessionId = testSessionId
    this.numChecks = checks.length
    // Sort the check files and checks alphabetically. This makes sure that there's a consistent order between runs.
    // For `checkly trigger`, getSourceFile() is not defined so we use optional chaining.
    const sortedCheckFiles = [...new Set(checks.map(({ check }) => check.getSourceFile?.()))].sort()
    const sortedChecks = checks.sort(({ check: a }, { check: b }) => a.name.localeCompare(b.name))
    this.checkFilesMap = new Map(sortedCheckFiles.map((file) => [file, new Map()]))
    sortedChecks.forEach(({ check, sequenceId }) => {
      const fileMap = this.checkFilesMap!.get(check.getSourceFile?.())!
      fileMap.set(sequenceId, {
        check,
        titleString: formatCheckTitle(CheckStatus.SCHEDULING, check),
        checkStatus: CheckStatus.SCHEDULING,
      })
    })
  }

  onCheckInProgress (check: any, sequenceId: SequenceId) {
    const checkFile = this.checkFilesMap!.get(check.getSourceFile?.())!.get(sequenceId)!
    checkFile.titleString = formatCheckTitle(CheckStatus.RUNNING, check)
    checkFile.checkStatus = CheckStatus.RUNNING
  }

  abstract onEnd(): void

  onSchedulingDelayExceeded () {
    this._isSchedulingDelayExceeded = true
  }

  onCheckAttemptResult(sequenceId: string, checkResult: any, links?: TestResultsShortLinks | undefined): void {
    const checkStatus = this.checkFilesMap!.get(checkResult.sourceFile)!.get(sequenceId)!
    checkResult.checkStatus = CheckStatus.RETRIED
    checkStatus.titleString = formatCheckTitle(CheckStatus.RETRIED, checkResult)
  }

  onCheckEnd (sequenceId: SequenceId, checkResult: any, links?: TestResultsShortLinks) {
    const checkStatus = this.checkFilesMap!.get(checkResult.sourceFile)!.get(sequenceId)!
    checkStatus.result = checkResult
    checkStatus.links = links
    checkStatus.checkStatus = checkResult.hasFailures ? CheckStatus.FAILED : CheckStatus.SUCCESSFUL
    checkStatus.titleString = formatCheckTitle(checkStatus.checkStatus, checkResult, {
      includeSourceFile: false,
    })
  }

  onError (err: Error) {
    printLn(chalk.red('Unable to run checks: ') + err.message)
  }

  // Clear the summary which was printed by _printStatus from stdout
  // TODO: Rather than clearing the whole status bar, we could overwrite the exact lines that changed.
  // This might look a bit smoother and reduce the flickering effects.
  _clearSummary () {
    printLn(this._clearString)
  }

  _printSummary (opts: { skipCheckCount?: boolean} = {}) {
    const counts = { numFailed: 0, numPassed: 0, numRunning: 0, scheduling: 0 }
    const status = []
    if (this.checkFilesMap!.size === 1 && this.checkFilesMap!.has(undefined)) {
      status.push(chalk.bold('Summary:'))
    }
    for (const [sourceFile, checkMap] of this.checkFilesMap!.entries()) {
      if (sourceFile) status.push(sourceFile)
      for (const [_, { titleString, result, checkStatus }] of checkMap.entries()) {
        if (checkStatus === CheckStatus.SCHEDULING) {
          counts.scheduling++
        } else if (!result) {
          counts.numRunning++
        } else if (result.hasFailures) {
          counts.numFailed++
        } else {
          counts.numPassed++
        }
        status.push(sourceFile ? indentString(titleString, 2) : titleString)
      }
    }

    if (!opts.skipCheckCount) {
      status.push('')
      status.push([
        counts.scheduling ? chalk.bold.blue(`${counts.scheduling} scheduling`) : undefined,
        counts.numRunning ? chalk.bold.magenta(`${counts.numRunning} running`) : undefined,
        counts.numFailed ? chalk.bold.red(`${counts.numFailed} failed`) : undefined,
        counts.numPassed ? chalk.bold.green(`${counts.numPassed} passed`) : undefined,
        `${this.numChecks} total`,
      ].filter(Boolean).join(', '))

      if (this._isSchedulingDelayExceeded && counts.scheduling) {
        status.push('Still waiting to schedule some checks. This may take a minute or two.',
        )
      }
    }

    status.push('')

    const statusString = status.join('\n')
    printLn(statusString)
    // Ansi escape code for erasing the line and moving the cursor up
    this._clearString = '\r\x1B[K\r\x1B[1A'.repeat(statusString.split('\n').length + 1)
  }

  _printBriefSummary () {
    const counts = { numFailed: 0, numPassed: 0, numPending: 0 }
    const status = []
    for (const [, checkMap] of this.checkFilesMap!.entries()) {
      for (const [_, { result }] of checkMap.entries()) {
        if (!result) {
          counts.numPending++
        } else if (result.hasFailures) {
          counts.numFailed++
        } else {
          counts.numPassed++
        }
      }
    }
    status.push('')
    status.push([
      counts.numFailed ? chalk.bold.red(`${counts.numFailed} failed`) : undefined,
      counts.numPassed ? chalk.bold.green(`${counts.numPassed} passed`) : undefined,
      counts.numPending ? chalk.bold.magenta(`${counts.numPending} pending`) : undefined,
      `${this.numChecks} total`,
    ].filter(Boolean).join(', '))
    status.push('')
    const statusString = status.join('\n')
    printLn(statusString)
    // Ansi escape code for erasing the line and moving the cursor up
    this._clearString = '\r\x1B[K\r\x1B[1A'.repeat(statusString.split('\n').length + 1)
  }

  async _printTestSessionsUrl () {
    if (this.testSessionId) {
      try {
        const { data: { link } } = await testSessions.getShortLink(this.testSessionId)
        printLn(`${chalk.white('Detailed session summary at:')} ${chalk.underline.cyan(link)}`, 2)
      } catch {
        printLn(`${chalk.white('Detailed session summary at:')} ${chalk.underline.cyan(getTestSessionUrl(this.testSessionId))}`, 2)
      }
    }
  }

  _runLocationString (): string {
    if (this.runLocation.type === 'PUBLIC') {
      return this.runLocation.region
    } else {
      return `private location ${this.runLocation.slugName}`
    }
  }
}
