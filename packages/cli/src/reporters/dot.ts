import chalk from 'chalk'
import AbstractListReporter from './abstract-list'
import { SequenceId } from '../services/abstract-check-runner'
import { print, printLn } from './util'

export default class DotReporter extends AbstractListReporter {
  onBegin (checks: Array<{ check: any, sequenceId: SequenceId }>, testSessionId?: string) {
    super.onBegin(checks, testSessionId)
    printLn(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2, 1)
  }

  onEnd () {
    this._printBriefSummary()
    this._printTestSessionsUrl()
  }

  onCheckEnd (sequenceId: SequenceId, checkResult: any) {
    super.onCheckEnd(sequenceId, checkResult)
    if (checkResult.hasFailures) {
      print(`${chalk.red('F')}`)
    } else {
      print(`${chalk.green('.')}`)
    }
  }
}
