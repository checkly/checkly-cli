import * as chalk from 'chalk'
import * as indentString from 'indent-string'

import { Reporter } from './reporter'
import { formatCheckTitle, CheckStatus, printLn, getTestSessionUrl } from './util'
import type { RunLocation } from '../services/check-runner'
import { Check } from '../constructs/check'

// Map from file -> check logicalId -> check+result.
// This lets us print a structured list of the checks.
// Map remembers the original insertion order, so each time we print the summary will be consistent.
export type checkFilesMap = Map<string, Map<string, { check?: Check, result?: any, titleString: string }>>

export default abstract class AbstractListReporter implements Reporter {
  _clearString = ''
  runLocation: RunLocation
  checkFilesMap: checkFilesMap
  numChecks: number
  verbose: boolean
  testSessionId?: string
  testResultIds?: { [key: string]: string }

  constructor (
    runLocation: RunLocation,
    checks: Array<Check>,
    verbose: boolean,
  ) {
    this.numChecks = checks.length
    this.runLocation = runLocation
    this.verbose = verbose

    // Sort the check files and checks alphabetically. This makes sure that there's a consistent order between runs.
    const sortedCheckFiles = [...new Set(checks.map((check) => check.getSourceFile()!))].sort()
    const sortedChecks = checks.sort((a, b) => a.name.localeCompare(b.name))
    this.checkFilesMap = new Map(sortedCheckFiles.map((file) => [file, new Map()]))
    sortedChecks.forEach(check => {
      const fileMap = this.checkFilesMap.get(check.getSourceFile()!)!
      fileMap.set(check.logicalId, {
        check,
        titleString: formatCheckTitle(CheckStatus.PENDING, check),
      })
    })
  }

  abstract onBeginStatic(): void

  abstract onBegin(testSessionId: string, testResultIds?: { [key: string]: string }): void

  abstract onEnd(): void

  onCheckEnd (checkResult: any) {
    const checkStatus = this.checkFilesMap.get(checkResult.sourceFile)!.get(checkResult.logicalId)!
    checkStatus.result = checkResult
    const status = checkResult.hasFailures ? CheckStatus.FAILED : CheckStatus.SUCCESSFUL
    checkStatus.titleString = formatCheckTitle(status, checkResult, {
      includeSourceFile: false,
    })
  }

  onError (err: Error) {
    printLn(chalk.red('Unable to run checks: ') + err.message)
  }

  _setTestSessionId (testSessionId?: string) {
    this.testSessionId = testSessionId
  }

  _setTestResultIds (testResultIds?: { [key: string]: string }) {
    this.testResultIds = testResultIds
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
    for (const [sourceFile, checkMap] of this.checkFilesMap.entries()) {
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
    for (const [, checkMap] of this.checkFilesMap.entries()) {
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
