const chalk = require('chalk')

class ListReporter {
  constructor () {
    this._clearString = ''
  }

  onBegin (checks) {
    this.checks = checks
    this.results = []
    this.inProgressChecks = {}
    this._printSummary()
  }

  onEnd () {

  }

  onCheckBegin (check) {
    this.inProgressChecks[check.logicalId] = check
    this._clearSummary()
    this._printSummary()
  }

  onCheckEnd (checkResult) {
    delete this.inProgressChecks[checkResult.logicalId]
    this.results.push(checkResult)

    // We want the SUCCEEDED/FAILED status to be above the summary, so we clear the summary first
    this._clearSummary()
    if (checkResult.hasFailures) {
      console.log(chalk.red(`${checkResult.name} - FAILED`))
    } else {
      console.log(chalk.green(`${checkResult.name} - SUCCEEDED`))
    }

    this._printSummary()
  }

  // Clear the summary which was printed by _printSummary from stdout
  _clearSummary () {
    console.log(this._clearString)
  }

  _printSummary () {
    const inProgressCheckSummaries = Object.values(this.inProgressChecks)
      .map(({ name }) => chalk.yellow(`${name} - IN PROGRESS`))

    // TODO: We will probably need to skip the interactive summary in CI environments
    const numFailedChecks = this.results.filter(({ hasFailures }) => hasFailures).length
    const numSuccessfulChecks = this.results.filter(({ hasFailures }) => !hasFailures).length
    const numPendingChecks = this.checks.length - numFailedChecks - numSuccessfulChecks
    const totalChecks = this.checks.length
    const checkCountOverview = `${
        chalk.bold('Checks:    ') +
        (numFailedChecks > 0 ? `${chalk.bold.red(`${numFailedChecks} failed`)}, ` : '') +
        (numPendingChecks > 0 ? `${chalk.bold.magenta(`${numPendingChecks} pending`)}, ` : '') +
        (numSuccessfulChecks > 0 ? `${chalk.bold.green(`${numSuccessfulChecks} passed`)}, ` : '')
    } ${totalChecks} total`

    const statusBarWidth = 40
    const length = Math.floor(statusBarWidth * (totalChecks - numPendingChecks) / totalChecks)
    const statusBar = `${chalk.green('█').repeat(length)}${chalk.white('█').repeat(statusBarWidth - length)}`

    const summary = [...inProgressCheckSummaries, checkCountOverview, statusBar].join('\n')
    console.log(summary)
    // Ansi escape code for erasing the line and moving the cursor up
    this._clearString = '\u001B[2K\u001B[1A'.repeat(summary.split('\n').length + 1)
  }
}

module.exports = ListReporter
