import chalk from 'chalk'
import { Flags } from '@oclif/core'
import config from '../services/config'
import * as api from '../rest/api'
import { AuthCommand } from './authCommand'
import { selectAccount } from './login'

export default class Switch extends AuthCommand {
  static hidden = false
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
      try {
        const { data: account } = await api.accounts.get(accountId)
        config.data.set('accountId', account.id)
        this.log(`Account switched to ${chalk.bold.cyan(accountId)}`)
      } catch {
        throw new Error(`Failed to find an account corresponding to account id ${accountId}`)
      }
      this.exit(0)
    }

    try {
      const { data: accounts } = await api.accounts.getAll()

      if (accounts.length === 1) {
        this.warn(
          'Your user is only a member of one account: '
          + chalk.bold.cyan(accounts[0].name),
        )
        this.exit(0)
      }

      const selectedAccount = await selectAccount(accounts, { onCancel })

      const { id, name } = selectedAccount

      config.data.set('accountId', id)
      config.data.set('accountName', name)

      this.log(`Account switched to ${chalk.bold.cyan(name)}`)
    } catch (err: any) {
      throw new Error(`Failed to switch account. ${err.message}`)
    }
  }
}
