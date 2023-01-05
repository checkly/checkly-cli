import * as chalk from 'chalk'
import * as indentString from 'indent-string'

import { Reporter } from './reporter'
import { formatCheckTitle, formatCheckResult, CheckStatus } from './util'

export default class CiReporter implements Reporter {
  checks: Array<any>
  results: Array<any>
  runLocation: string

  constructor (runLocation: string, checks: Array<any>) {
    this.checks = checks
    this.runLocation = runLocation
    this.results = []
  }

  onBegin () {
    console.log(`\nRunning ${this.checks.length} checks in ${this.runLocation}.\n`)
  }

  onEnd () {
    const failedChecks = this.results.filter(({ hasFailures }) => hasFailures)
    const numFailedChecks = failedChecks.length
    const numSuccessfulChecks = this.results.length - numFailedChecks
    const totalChecks = this.checks.length
    const checkCountOverview = [
      numFailedChecks ? chalk.bold.red(`${numFailedChecks} failed`) : undefined,
      numSuccessfulChecks ? chalk.bold.green(`${numSuccessfulChecks} passed`) : undefined,
      `${totalChecks} total`,
    ].filter(Boolean).join(', ')

    const summary = [
      '',
      checkCountOverview,
      '',
      ...failedChecks.map(checkResult => indentString(formatCheckTitle(CheckStatus.FAILED, checkResult), 2)),
    ].join('\n')
    console.log(summary)
  }

  onCheckBegin (check: any) {
    // Do nothing when checks begin
  }

  onCheckEnd (checkResult: any) {
    this.results.push(checkResult)
    if (checkResult.hasFailures) {
      console.log(formatCheckTitle(CheckStatus.FAILED, checkResult))
      console.log(indentString(formatCheckResult(checkResult), 2))
    } else {
      console.log(formatCheckTitle(CheckStatus.SUCCESSFUL, checkResult))
    }
  }
}
