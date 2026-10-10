import chalk from 'chalk'
import { Flags } from '@oclif/core'
import * as api from '../rest/api.js'
import { AuthCommand } from './authCommand.js'
import { formatAccounts, selectAccount, selectAccountLine } from './login.js'
import { activateAccount } from '../helpers/activate-account.js'
import config from '../services/config.js'
import commonMessages from '../messages/common-messages.js'
import { detectCliMode, isPersonAtTerminal, type CliMode } from '../helpers/cli-mode.js'
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
      this.warnAboutOverride()
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

    const mode = detectCliMode()
    if (mode !== 'interactive' || !isPersonAtTerminal()) {
      return this.reportChoices(accounts, mode)
    }

    try {
      const selectedAccount = await selectAccount(accounts, { onCancel })

      await activateAccount(selectedAccount)

      this.log(`Account switched to ${chalk.bold.cyan(selectedAccount.name)}`)
      this.warnAboutOverride()
    } catch (err: any) {
      throw new Error(`Failed to switch account. ${err.message}`, { cause: err })
    }
  }

  /** A new default does not apply while `CHECKLY_ACCOUNT_ID` picks the account; say so. */
  private warnAboutOverride (): void {
    if (config.getCredentialSource() === 'account_override') {
      this.warn(commonMessages.accountOverride(config.getAccountId()))
    }
  }

  /**
   * Without a person at a terminal nobody can answer the account menu, so
   * list the accounts and the commands that choose one instead. An agent
   * gets the `select_account` line `checkly login` prints; the user has to
   * choose, as there.
   */
  private reportChoices (accounts: Account[], mode: CliMode): never {
    if (mode === 'agent') {
      // The stored default, not `this.account`: a `CHECKLY_ACCOUNT_ID` in the
      // environment picks the account in use without changing the default.
      const { accountId, accountName } = config.data.store as { accountId?: string, accountName?: string }
      const defaultAccount = accountId ? { id: accountId, name: accountName ?? accountId } : null
      this.log(selectAccountLine({
        message: (defaultAccount ? `The default account is "${defaultAccount.name}". ` : 'No default account is set. ')
          + 'Ask the user which account to switch to, then run `npx checkly switch --account-id <id>` to make it '
          + 'the default, or set `CHECKLY_ACCOUNT_ID=<id>` on a command to use the account for that command only.'
          + (config.getCredentialSource() === 'account_override'
            ? ` ${commonMessages.accountOverride(config.getAccountId())}`
            : ''),
        accounts,
        defaultCommand: 'npx checkly switch --account-id <id>',
        extra: { defaultAccount },
      }))
      return this.exit(1)
    }
    return this.error('`npx checkly switch` needs a terminal to ask which account to use. Choose one with '
      + `\`npx checkly switch --account-id <id>\`. Available: ${formatAccounts(accounts)}`, { exit: 1 })
  }
}
