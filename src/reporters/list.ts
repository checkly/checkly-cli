import * as chalk from 'chalk'

const FAIL = chalk.supportsColor
  ? chalk.reset.inverse.bold.red(` ${'FAIL'} `)
  : 'FAIL'

const PASS = chalk.supportsColor
  ? chalk.reset.inverse.bold.green(` ${'PASS'} `)
  : 'PASS'

const RUNS = chalk.supportsColor
  ? chalk.reset.inverse.bold.yellow(` ${'RUNS'} `)
  : 'RUNS'

const TITLE_BULLET = chalk.bold('\u25cf ')

class ListReporter {
  _clearString = ''
  checks : Array<any>
  results : Array<any>
  inProgressChecks: Record<string, any>

  constructor (checks: Array<any>) {
    this.results = []
    this.inProgressChecks = {}
    this.checks = checks
    this.results = []
    this.inProgressChecks = {}
  }

  onBegin () {
    this._printSummary()
  }

  onEnd () {
    this._clearSummary()
    this._printSummary()
  }

  onCheckBegin (check: any) {
    this.inProgressChecks[check.logicalId] = check
    this._clearSummary()
    this._printSummary()
  }

  onCheckEnd (checkResult: any) {
    delete this.inProgressChecks[checkResult.logicalId]
    this.results.push(checkResult)

    // We want the SUCCEEDED/FAILED status to be above the summary, so we clear the summary first
    this._clearSummary()
    if (checkResult.hasFailures) {
      console.log(`${FAIL} - ${checkResult.name}`)
      console.log(`  ${TITLE_BULLET}Console\n\n${this.getConsoleOutput(checkResult.logs)}`)
    } else {
      console.log(`${PASS} - ${checkResult.name}`)
    }

    this._printSummary()
  }

  // Clear the summary which was printed by _printSummary from stdout
  _clearSummary () {
    console.log(this._clearString)
  }

  _printSummary () {
    const inProgressCheckSummaries = Object.values(this.inProgressChecks)
      .map(({ name }) => `${RUNS} - ${name}`)

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

    const summary = [...inProgressCheckSummaries, '', checkCountOverview, statusBar].join('\n')
    console.log(summary)
    // Ansi escape code for erasing the line and moving the cursor up
    this._clearString = '\r\x1B[K\r\x1B[1A'.repeat(summary.split('\n').length + 1)
  }

  // Add logs as a type to the assets
  getConsoleOutput (logs: Array<any>) {
    const TITLE_INDENT = ' '.repeat(2)
    const CONSOLE_INDENT = TITLE_INDENT + ' '.repeat(2)

    const logEntries = logs.reduce((output, { level, msg: message }: {level: string, msg: string}) => {
      const type = level.toLowerCase()
      message = message
        .split(/\n/)
        .map(line => CONSOLE_INDENT + line)
        .join('\n')

      let typeMessage = `console.${type}`
      // let noStackTrace = true
      // let noCodeFrame = true

      if (type === 'warn') {
        message = chalk.yellow(message)
        typeMessage = chalk.yellow(typeMessage)
        // noStackTrace = globalConfig?.noStackTrace ?? false
        // noCodeFrame = false
      } else if (type === 'error') {
        message = chalk.red(message)
        typeMessage = chalk.red(typeMessage)
        // noStackTrace = globalConfig?.noStackTrace ?? false
        // noCodeFrame = false
      }

      // const options: StackTraceOptions = {
      //   noCodeFrame,
      //   noStackTrace,
      // };

      // const formattedStackTrace = formatStackTrace(origin, config, options);

      return `${
        output + TITLE_INDENT + chalk.dim(typeMessage)
      }\n${message.trimRight()}\n${chalk.dim(
        // formattedStackTrace.trimRight(),
      )}\n`
    }, '')

    return `${logEntries.trimRight()}\n`
  }
}

export default ListReporter
