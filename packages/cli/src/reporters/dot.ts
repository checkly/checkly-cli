import chalk from 'chalk'
import AbstractListReporter from './abstract-list'
import { CheckRunId } from '../services/abstract-check-runner'
import { print, printLn } from './util'

export default class DotReporter extends AbstractListReporter {
  onBegin (checks: Array<{ check: any, checkRunId: CheckRunId, testResultId?: string }>, testSessionId?: string) {
    super.onBegin(checks, testSessionId)
    printLn(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2, 1)
  }

  onEnd () {
    this._printBriefSummary()
  }

  onCheckEnd (checkRunId: CheckRunId, checkResult: any) {
    super.onCheckEnd(checkRunId, checkResult)
    if (checkResult.hasFailures) {
      print(`${chalk.red('F')}`)
    } else {
      print(`${chalk.green('.')}`)
    }
  }
}
