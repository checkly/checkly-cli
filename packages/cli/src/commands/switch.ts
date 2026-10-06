import chalk from 'chalk'
import { Flags } from '@oclif/core'
import * as api from '../rest/api.js'
import { AuthCommand } from './authCommand.js'
import { selectAccount } from './login.js'
import { activateAccount } from '../helpers/activate-account.js'

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

    try {
      const { data: accounts } = await api.accounts.getAll()

      const selectedAccount = await selectAccount(accounts, { onCancel })

      await activateAccount(selectedAccount)

      this.log(`Account switched to ${chalk.bold.cyan(selectedAccount.name)}`)
    } catch (err: any) {
      throw new Error(`Failed to switch account. ${err.message}`, { cause: err })
    }
  }
}
