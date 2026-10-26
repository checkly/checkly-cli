import chalk from 'chalk'
import { ux } from '@oclif/core'

import { BaseCommand } from '../commands/baseCommand.js'
import { Diagnostics } from '../constructs/diagnostics.js'
import { NotFoundError } from '../rest/errors.js'
import { wrap } from './wrap.js'
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
    // No `{ stdout: true }`: oclif renders the spinner on stderr by default,
    // which keeps stdout reserved for command output.
    ux.action.start(message)
  }

  actionStatus (message: string) {
    ux.action.status = message
  }

  actionSuccess () {
    ux.action.stop(`✅`)
    this.c.logToStderr()
  }

  actionFailure () {
    ux.action.stop(`❌`)
    this.c.logToStderr()
  }

  // Only success messages (a mutation's confirmation) and JSON error envelopes
  // are results on stdout. Comments, info, warnings, and human-readable errors
  // are never the command's result: they go to stderr so they cannot pollute
  // machine-readable stdout.

  comment (message: string) {
    this.c.logToStderr(chalk.cyan(wrap(message, { ...textWrapOptions, prefix: '// ' })))
    this.c.logToStderr()
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

  // A step of a multi-step command that went well, not its result.
  stepSuccess (message: string) {
    this.c.logToStderr(`${logSymbols.success} ${message}`)
    this.c.logToStderr()
  }

  longInfo (title: string, message: string) {
    this.c.logToStderr(`${logSymbols.info} ${title}`)
    this.c.logToStderr()
    this.c.logToStderr(wrap(message, textWrapOptions))
    this.c.logToStderr()
  }

  shortInfo (message: string) {
    this.c.logToStderr(`${logSymbols.info} ${message}`)
    this.c.logToStderr()
  }

  longWarning (title: string, message: string | Error) {
    this.c.logToStderr(`${logSymbols.warning} ${title}`)
    this.c.logToStderr()
    this.c.logToStderr(chalk.yellow(this.#formatDescription(message)))
    this.c.logToStderr()
  }

  shortWarning (message: string) {
    this.c.logToStderr(`${logSymbols.warning} ${chalk.yellow(message)}`)
    this.c.logToStderr()
  }

  longError (title: string, message: string | Error) {
    const hint = message instanceof NotFoundError ? this.c.notFoundHint() : undefined
    if (this.outputFormat === 'json') {
      // The searched account as data, so an agent need not parse the hint.
      // The envelope is the command's (failed) result, so it stays on stdout.
      this.c.log(JSON.stringify({
        error: title,
        detail: this.#plainDescription(message),
        ...hint && { hint, searchedAccount: this.c.searchedAccount() },
      }))
      return
    }
    this.c.logToStderr(`${logSymbols.error} ${title}`)
    this.c.logToStderr()
    this.c.logToStderr(chalk.red(this.#formatDescription(message)))
    if (hint) {
      this.c.logToStderr(wrap(hint, textWrapOptions))
    }
    this.c.logToStderr()
  }

  shortError (message: string) {
    if (this.outputFormat === 'json') {
      this.c.log(JSON.stringify({ error: message }))
      return
    }
    this.c.logToStderr(`${logSymbols.error} ${chalk.red(message)}`)
    this.c.logToStderr()
  }

  diagnostics (diagnostics: Diagnostics) {
    for (const diag of diagnostics.observations) {
      if (diag.isFatal()) {
        this.longError(diag.title, diag.message)
      } else if (!diag.isBenign()) {
        this.longWarning(diag.title, diag.message)
      } else {
        this.longInfo(diag.title, diag.message)
      }
    }
  }

  fatal (message: string) {
    this.c.logToStderr(chalk.red(message))
    this.c.logToStderr()
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
