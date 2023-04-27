import * as chalk from 'chalk'
import * as indentString from 'indent-string'

import { Reporter } from './reporter'
import { formatCheckTitle, CheckStatus, printLn, getTestSessionUrl } from './util'
import type { RunLocation, CheckRunId } from '../services/abstract-check-runner'
import { Check } from '../constructs/check'

// Map from file -> checkRunId -> check+result.
// This lets us print a structured list of the checks.
// Map remembers the original insertion order, so each time we print the summary will be consistent.
export type checkFilesMap = Map<string, Map<CheckRunId, {
  check?: Check,
  result?: any,
  titleString: string,
  testResultId?: string
}>>

export default abstract class AbstractListReporter implements Reporter {
  _clearString = ''
  runLocation: RunLocation
  checkFilesMap?: checkFilesMap
  numChecks?: number
  verbose: boolean
  testSessionId?: string

  constructor (
    runLocation: RunLocation,
    verbose: boolean,
  ) {
    this.runLocation = runLocation
    this.verbose = verbose
  }

  abstract onBeginStatic(): void

  onBegin (checks: Array<{ check: any, checkRunId: CheckRunId, testResultId?: string }>, testSessionId?: string): void {
    this.testSessionId = testSessionId
    this.numChecks = checks.length
    // Sort the check files and checks alphabetically. This makes sure that there's a consistent order between runs.
    const sortedCheckFiles = [...new Set(checks.map(({ check }) => check.getSourceFile()!))].sort()
    const sortedChecks = checks.sort(({ check: a }, { check: b }) => a.name.localeCompare(b.name))
    this.checkFilesMap = new Map(sortedCheckFiles.map((file) => [file, new Map()]))
    sortedChecks.forEach(({ check, testResultId, checkRunId }) => {
      const fileMap = this.checkFilesMap!.get(check.getSourceFile()!)!
      fileMap.set(checkRunId, {
        check,
        titleString: formatCheckTitle(CheckStatus.PENDING, check),
        testResultId,
      })
    })
  }

  abstract onEnd(): void

  onCheckEnd (checkRunId: CheckRunId, checkResult: any) {
    const checkStatus = this.checkFilesMap!.get(checkResult.sourceFile)!.get(checkRunId)!
    checkStatus.result = checkResult
    const status = checkResult.hasFailures ? CheckStatus.FAILED : CheckStatus.SUCCESSFUL
    checkStatus.titleString = formatCheckTitle(status, checkResult, {
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
    const counts = { numFailed: 0, numPassed: 0, numPending: 0 }
    const status = []
    for (const [sourceFile, checkMap] of this.checkFilesMap!.entries()) {
      status.push(sourceFile)
      for (const [_, { titleString, result }] of checkMap.entries()) {
        if (!result) {
          counts.numPending++
        } else if (result.hasFailures) {
          counts.numFailed++
        } else {
          counts.numPassed++
        }
        status.push(indentString(titleString, 2))
      }
    }
    if (!opts.skipCheckCount) {
      status.push('')
      status.push([
        counts.numFailed ? chalk.bold.red(`${counts.numFailed} failed`) : undefined,
        counts.numPassed ? chalk.bold.green(`${counts.numPassed} passed`) : undefined,
        counts.numPending ? chalk.bold.magenta(`${counts.numPending} pending`) : undefined,
        `${this.numChecks} total`,
      ].filter(Boolean).join(', '))
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

  _printTestSessionsUrl () {
    if (this.testSessionId) {
      printLn(`${chalk.white('Detailed session summary at:')} ${chalk.underline.cyan(getTestSessionUrl(this.testSessionId))}`, 2)
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
