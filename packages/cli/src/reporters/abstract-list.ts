import chalk = require('chalk')
import * as indentString from 'indent-string'

import { Reporter } from './reporter'
import { formatCheckTitle, CheckStatus } from './util'
import type { RunLocation } from '../services/check-runner'

export default abstract class AbstractListReporter implements Reporter {
  _clearString = ''
  runLocation: RunLocation
  // Map from file -> check logicalId -> check+result.
  // This lets us print a structured list of the checks.
  // Map remembers the original insertion order, so each time we print the summary will be consistent.
  checkFilesMap: Map<string, Map<string, { check?: any, result?: any, titleString: string }>>
  numChecks: number
  verbose: boolean

  constructor (runLocation: RunLocation, checks: Array<any>, verbose: boolean) {
    this.numChecks = checks.length
    this.runLocation = runLocation
    this.verbose = verbose

    // Sort the check files and checks alphabetically. This makes sure that there's a consistent order between runs.
    const sortedCheckFiles = [...new Set(checks.map(({ sourceFile }) => sourceFile))].sort()
    const sortedChecks = checks.sort((a, b) => a.name.localeCompare(b.name))
    this.checkFilesMap = new Map(sortedCheckFiles.map((file) => [file, new Map()]))
    sortedChecks.forEach(check => {
      const fileMap = this.checkFilesMap.get(check.sourceFile)!
      fileMap.set(check.logicalId, {
        check,
        titleString: formatCheckTitle(CheckStatus.PENDING, check),
      })
    })
  }

  abstract onBegin(): void

  abstract onEnd(): void

  onCheckEnd (checkResult: any) {
    const checkStatus = this.checkFilesMap.get(checkResult.sourceFile)!.get(checkResult.logicalId)!
    checkStatus.result = checkResult
    const status = checkResult.hasFailures ? CheckStatus.FAILED : CheckStatus.SUCCESSFUL
    checkStatus.titleString = formatCheckTitle(status, checkResult, {
      includeSourceFile: false,
    })
  }

  // Clear the summary which was printed by _printStatus from stdout
  // TODO: Rather than clearing the whole status bar, we could overwrite the exact lines that changed.
  // This might look a bit smoother and reduce the flickering effects.
  _clearSummary () {
    console.log(this._clearString)
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
    console.log(statusString)
    // Ansi escape code for erasing the line and moving the cursor up
    this._clearString = '\r\x1B[K\r\x1B[1A'.repeat(statusString.split('\n').length + 1)
  }

  _runLocationString (): string {
    if (this.runLocation.type === 'PUBLIC') {
      return this.runLocation.region
    } else {
      return `private location ${this.runLocation.slugName}`
    }
  }
}
