import chalk from 'chalk'
import { Flags } from '@oclif/core'
import * as api from '../rest/api.js'
import { AuthCommand } from './authCommand.js'
import { selectAccount } from './login.js'
import { activateAccount } from '../helpers/activate-account.js'
import { detectCliMode, isPersonAtTerminal } from '../helpers/cli-mode.js'
import type { Account } from '../rest/accounts.js'

export default class Switch extends AuthCommand {
  static hidden = false
  static idempotent = true
  static description = 'Switch user account.'
  static flags = {
    'account-id': Flags.string({
      char: 'a',
      name: 'accountId',
      description: 'The id of the account you want to switch to.',
    }),
  }

  async run () {
    const { flags } = await this.parse(Switch)
    const { 'account-id': accountId } = flags

    const onCancel = (): void => {
      this.error('Command cancelled.\n')
    }

    if (accountId) {
      let account
      try {
        ({ data: account } = await api.accounts.get(accountId))
      } catch (err: any) {
        throw new Error(`Failed to find an account corresponding to account id ${accountId}`, { cause: err })
      }
      try {
        await activateAccount(account)
      } catch (err: any) {
        throw new Error(`Failed to switch account. ${err.message}`, { cause: err })
      }
      this.log(`Account switched to ${chalk.bold.cyan(account.name)} (${account.id})`)
      this.exit(0)
    }

    // The login this run just did already chose the account (asking when
    // there were several) and, in agent mode, reported it as JSON.
    if (this.loggedInInline) {
      if (detectCliMode() !== 'agent') {
        this.log(`Logged in to ${chalk.bold.cyan(this.account.name)}. Run \`npx checkly switch\` to change accounts.`)
      }
      return
    }

    let accounts: Account[]
    try {
      ({ data: accounts } = await api.accounts.getAll())
    } catch (err: any) {
      throw new Error(`Failed to switch account. ${err.message}`, { cause: err })
    }

    if (detectCliMode() !== 'interactive' || !isPersonAtTerminal()) {
      return this.reportChoices(accounts)
    }

    try {
      const selectedAccount = await selectAccount(accounts, { onCancel })

      await activateAccount(selectedAccount)

      this.log(`Account switched to ${chalk.bold.cyan(selectedAccount.name)}`)
    } catch (err: any) {
      throw new Error(`Failed to switch account. ${err.message}`, { cause: err })
    }
  }

  /**
   * Without a person at a terminal nobody can answer the account menu, so
   * list the accounts and the commands that choose one instead. An agent
   * gets the `select_account` line `checkly login` prints; the user has to
   * choose, as there.
   */
  private reportChoices (accounts: Account[]): never {
    const choices = accounts.map(({ id, name }) => ({ id, name }))
    const current = { id: this.account.id, name: this.account.name }
    if (detectCliMode() === 'agent') {
      this.log(JSON.stringify({
        status: 'action_required',
        reason: 'select_account',
        userActionRequired: true,
        message: `The default account is "${current.name}". Ask the user which account to switch to, then run `
          + '`npx checkly switch --account-id <id>` to make it the default, or set `CHECKLY_ACCOUNT_ID=<id>` '
          + 'on a command to use the account for that command only.',
        currentAccount: current,
        choices,
        next: [
          { command: 'npx checkly switch --account-id <id>', when: 'to make the account the default' },
          { command: 'CHECKLY_ACCOUNT_ID=<id> npx checkly <command>', when: 'to use the account for one command only' },
        ],
      }))
      return this.exit(1)
    }
    return this.error('`npx checkly switch` needs a terminal to ask which account to use. Choose one with '
      + '`npx checkly switch --account-id <id>`. Available: '
      + choices.map(({ id, name }) => `${name} (${id})`).join(', '), { exit: 1 })
  }
}
