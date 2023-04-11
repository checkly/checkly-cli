import * as chalk from 'chalk'
import AbstractListReporter from './abstract-list'
import { print, printLn } from './util'

export default class DotReporter extends AbstractListReporter {
  onBeginStatic () {
    printLn(`Running ${this.numChecks} checks in ${this._runLocationString()}.`, 2, 1)
  }

  onBegin () {
    this.onBeginStatic()
  }

  onEnd () {
    this._printBriefSummary()
  }

  onCheckEnd (checkResult: any) {
    super.onCheckEnd(checkResult)
    if (checkResult.hasFailures) {
      print(`${chalk.red('F')}`)
    } else {
      print(`${chalk.green('.')}`)
    }
  }
}
