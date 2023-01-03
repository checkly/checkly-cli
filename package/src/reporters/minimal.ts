import * as chalk from 'chalk'
import * as boxen from 'boxen' // TODO: Figure out the ESModules so that we're not stuck on old versions

import { Reporter } from './reporter'
import { formatCheckTitle, formatCheckResult, CheckStatus } from './util'

export default class MinimalReporter implements Reporter {
  _clearString = ''
  checks: Array<any>
  results: Array<any>
  inProgressChecks: Record<string, any>
  runLocation: string

  constructor (runLocation: string, checks: Array<any>) {
    this.inProgressChecks = {}
    this.checks = checks
    this.results = []
    this.inProgressChecks = {}
    this.runLocation = runLocation
  }

  onBegin () {
    console.log(`\nRunning ${this.checks.length} checks in ${this.runLocation}.\n`)
    this._printProgressSummary()
  }

  onEnd () {
    this._clearSummary()
    this._printProgressSummary()
  }

  onCheckBegin (check: any) {
    this.inProgressChecks[check.logicalId] = check
    this._clearSummary()
    this._printProgressSummary()
  }

  onCheckEnd (checkResult: any) {
    delete this.inProgressChecks[checkResult.logicalId]
    this.results.push(checkResult)

    // We want the SUCCEEDED/FAILED status to be above the summary, so we clear the summary first
    this._clearSummary()

    if (checkResult.hasFailures) {
      const checkResultString = formatCheckResult(checkResult)
      console.log(boxen(checkResultString, { title: formatCheckTitle(CheckStatus.FAILED, checkResult), padding: 2 }))
    }

    this._printProgressSummary()
  }

  // Clear the summary which was printed by _printSummary from stdout
  _clearSummary () {
    console.log(this._clearString)
  }

  _printProgressSummary () {
    const failedChecks = this.results.filter(({ hasFailures }) => hasFailures)
    const numFailedChecks = failedChecks.length
    const numSuccessfulChecks = this.results.length - numFailedChecks
    const numPendingChecks = this.checks.length - numFailedChecks - numSuccessfulChecks
    const totalChecks = this.checks.length
    const checkCountOverview = [
      numFailedChecks ? chalk.bold.red(`${numFailedChecks} failed`) : undefined,
      numSuccessfulChecks ? chalk.bold.green(`${numSuccessfulChecks} passed`) : undefined,
      numPendingChecks ? chalk.bold.magenta(`${numPendingChecks} pending`) : undefined,
      `${totalChecks} total`,
    ].filter(Boolean).join(', ')
    const summary = `\n${checkCountOverview}\n`
    console.log(summary)
    // Ansi escape code for erasing the line and moving the cursor up
    this._clearString = '\r\x1B[K\r\x1B[1A'.repeat(summary.split('\n').length + 1)
  }
}
