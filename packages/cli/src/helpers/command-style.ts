import chalk from 'chalk'
import { ux } from '@oclif/core'

import { BaseCommand } from '../commands/baseCommand'
import { wrap } from './wrap'
import logSymbols from 'log-symbols'

const textWrapOptions = {
  prefix: '  ',
  length: 78,
}

const errorWrapOptions = {
  ...textWrapOptions,
  length: Infinity,
}

export class CommandStyle {
  private c: BaseCommand
  outputFormat?: string

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
    this.c.log(chalk.cyan(wrap(message, { ...textWrapOptions, prefix: '// ' })))
    this.c.log()
  }

  longSuccess (title: string, message: string) {
    this.c.log(`${logSymbols.success} ${title}`)
    this.c.log()
    this.c.log(wrap(message, textWrapOptions))
    this.c.log()
  }

  shortSuccess (message: string) {
    this.c.log(`${logSymbols.success} ${message}`)
    this.c.log()
  }

  longInfo (title: string, message: string) {
    this.c.log(`${logSymbols.info} ${title}`)
    this.c.log()
    this.c.log(wrap(message, textWrapOptions))
    this.c.log()
  }

  shortInfo (message: string) {
    this.c.log(`${logSymbols.info} ${message}`)
    this.c.log()
  }

  longWarning (title: string, message: string | Error) {
    this.c.log(`${logSymbols.warning} ${title}`)
    this.c.log()
    this.c.log(chalk.yellow(this.#formatDescription(message)))
    this.c.log()
  }

  shortWarning (message: string) {
    this.c.log(`${logSymbols.warning} ${chalk.yellow(message)}`)
    this.c.log()
  }

  longError (title: string, message: string | Error) {
    if (this.outputFormat === 'json') {
      this.c.log(JSON.stringify({ error: title, detail: this.#plainDescription(message) }))
      return
    }
    this.c.log(`${logSymbols.error} ${title}`)
    this.c.log()
    this.c.log(chalk.red(this.#formatDescription(message)))
    this.c.log()
  }

  shortError (message: string) {
    if (this.outputFormat === 'json') {
      this.c.log(JSON.stringify({ error: message }))
      return
    }
    this.c.log(`${logSymbols.error} ${chalk.red(message)}`)
    this.c.log()
  }

  fatal (message: string) {
    this.c.log(chalk.red(message))
    this.c.log()
  }

  #formatDescription (description: string | Error) {
    if (typeof description === 'string') {
      return wrap(description, textWrapOptions)
    }

    const { message } = description

    return wrap(message, errorWrapOptions)
  }

  #plainDescription (description: string | Error): string {
    return typeof description === 'string' ? description : description.message
  }
}
