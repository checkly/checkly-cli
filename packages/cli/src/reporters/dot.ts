import * as chalk from 'chalk'
import AbstractListReporter from './abstract-list'
import type { PublicRunLocation } from '../services/check-runner'
import { print, printLn } from './util'

export default class DotReporter extends AbstractListReporter {
  onBeginStatic () {
    printLn(`${chalk.bold.grey('Running')} ${
      chalk.bold.white(this.numChecks)} ${chalk.bold.grey('tests in')} ${
        chalk.bold.white((this.runLocation as PublicRunLocation).region)} ${
          chalk.bold.grey('location')}.`, undefined, 1)
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
