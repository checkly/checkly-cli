import chalk from 'chalk'
import AbstractListReporter from './abstract-list.js'
import { SequenceId } from '../services/abstract-check-runner.js'
import { printLnErr } from './util.js'

export default class DotReporter extends AbstractListReporter {
  #printedMarks = false

  onBegin (checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId?: string) {
    super.onBegin(checks, testSessionId)
    printLnErr(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2)
  }

  onEnd () {
    // Ends the line of marks on stderr, which may not share a terminal with
    // the summary on stdout.
    if (this.#printedMarks) {
      printLnErr('')
    }
    this._printBriefSummary({ lineEnded: this.#printedMarks })
    this._printExecutionErrors()
    this._printTestSessionsUrl()
  }

  // One mark per finished check is run progress, so it goes to stderr; the
  // brief summary in onEnd is the result.
  onCheckEnd (sequenceId: SequenceId, checkResult: any) {
    super.onCheckEnd(sequenceId, checkResult)
    this.#printedMarks = true
    if (checkResult.timedOut) {
      printLnErr(`${chalk.red('T')}`, 0)
    } else if (checkResult.hasFailures) {
      printLnErr(`${chalk.red('F')}`, 0)
    } else if (checkResult.isDegraded) {
      printLnErr(`${chalk.yellow('D')}`, 0)
    } else {
      printLnErr(`${chalk.green('.')}`, 0)
    }
  }
}
