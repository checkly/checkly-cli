const chalk = require('chalk')

class ListReporter {
  constructor () {
    this._clearString = ''
  }

  onBegin (checks) {
    this.checks = checks
    this.results = []

    this._printSummary()
  }

  onEnd () {

  }

  onCheckBegin () {

  }

  onCheckEnd (checkResult) {
    this.results.push(checkResult)
    this._printSummary()
  }

  _numFailedChecks () {
    return this.results.filter(({ hasFailures }) => hasFailures).length
  }

  _numSuccessfulChecks () {
    return this.results.filter(({ hasFailures }) => !hasFailures).length
  }

  _printSummary () {
    const numFailedChecks = this.results.filter(({ hasFailures }) => hasFailures).length
    const numSuccessfulChecks = this.results.filter(({ hasFailures }) => !hasFailures).length
    const numPendingChecks = this.checks.length - numFailedChecks - numSuccessfulChecks
    const totalChecks = this.checks.length
    const checks = `${
        chalk.bold('Checks:    ') +
        (numFailedChecks > 0 ? `${chalk.bold.red(`${numFailedChecks} failed`)}, ` : '') +
        (numPendingChecks > 0 ? `${chalk.bold.magenta(`${numPendingChecks} pending`)}, ` : '') +
        (numSuccessfulChecks > 0 ? `${chalk.bold.green(`${numSuccessfulChecks} passed`)}, ` : '')
    } ${totalChecks} total`

    const statusBarWidth = 40
    const length = Math.floor(statusBarWidth * (totalChecks - numPendingChecks) / totalChecks)
    const statusBar = `${chalk.green('█').repeat(length)}${chalk.white('█').repeat(statusBarWidth - length)}`

    const summary = [checks, statusBar].join('\n')
    console.log(this._clearString)
    console.log(summary)
    // Ansi escape code for erasing the line and moving the cursor up
    this._clearString = '\u001B[2K\u001B[1A'.repeat(summary.split('\n').length + 1)
  }
}

module.exports = ListReporter
