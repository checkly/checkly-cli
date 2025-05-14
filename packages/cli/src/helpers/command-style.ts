import chalk from 'chalk'
import { ux } from '@oclif/core'

import { BaseCommand } from '../commands/baseCommand'
import { wrap } from './wrap'
import logSymbols from 'log-symbols'

const wrapOptions = {
  prefix: '  ',
  length: 78,
}

export class CommandStyle {
  private c: BaseCommand

  constructor (command: BaseCommand) {
    this.c = command
  }

  actionStart (message: string) {
    if (this.c.fancy) {
      ux.action.start(message, undefined, { stdout: true })
    }
  }

  actionSuccess () {
    if (this.c.fancy) {
      ux.action.stop(`✅`)
      this.c.log()
    }
  }

  actionFailure () {
    if (this.c.fancy) {
      ux.action.stop(`❌`)
      this.c.log()
    }
  }

  comment (message: string) {
    this.c.log(chalk.cyan(wrap(message, { ...wrapOptions, prefix: '// ' })))
    this.c.log()
  }

  longSuccess (title: string, message: string) {
    this.c.log(`${logSymbols.success} ${title}`)
    this.c.log()
    this.c.log(wrap(message, wrapOptions))
    this.c.log()
  }

  shortSuccess (message: string) {
    this.c.log(`${logSymbols.success} ${message}`)
    this.c.log()
  }

  longInfo (title: string, message: string) {
    this.c.log(`${logSymbols.info} ${title}`)
    this.c.log()
    this.c.log(wrap(message, wrapOptions))
    this.c.log()
  }

  shortInfo (message: string) {
    this.c.log(`${logSymbols.info} ${message}`)
    this.c.log()
  }

  longWarning (title: string, message: string) {
    this.c.log(`${logSymbols.warning} ${title}`)
    this.c.log()
    this.c.log(chalk.yellow(wrap(message, wrapOptions)))
    this.c.log()
  }

  shortWarning (message: string) {
    this.c.log(`${logSymbols.warning} ${chalk.yellow(message)}`)
    this.c.log()
  }

  longError (title: string, message: string) {
    this.c.log(`${logSymbols.error} ${title}`)
    this.c.log()
    this.c.log(chalk.red(wrap(message, wrapOptions)))
    this.c.log()
  }

  shortError (message: string) {
    this.c.log(`${logSymbols.error} ${chalk.red(message)}`)
    this.c.log()
  }

  fatal (message: string) {
    this.c.log(chalk.red(message))
    this.c.log()
  }
}
