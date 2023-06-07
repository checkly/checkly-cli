import * as chalk from 'chalk'
import { Flags } from '@oclif/core'
import * as prompts from 'prompts'
import config from '../services/config'
import * as api from '../rest/api'
import { AuthCommand } from './authCommand'

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

    if (accountId) {
      try {
        const { data: account } = await api.accounts.get(accountId)
        config.data.set('accountId', account.id)
        this.log(`Account switched to ${chalk.bold.cyan(accountId)}`)
      } catch (e) {
        throw new Error(`Failed to find an account corresponding to account id ${accountId}`)
      }
      this.exit(0)
    }

    try {
      const { data: accounts } = await api.accounts.getAll()

      if (accounts.length === 1) {
        this.warn(
          'Your user is only a member of one account: ' +
            chalk.bold.cyan(accounts[0].name),
        )
        this.exit(0)
      }

      const { selectedAccountName } = await prompts({
        name: 'selectedAccountName',
        type: 'select',
        choices: accounts.map(({ name }) => ({ title: name, value: name })),
        message: 'Select a new Checkly account',
      })

      const { id, name } = accounts.find(({ name }) => name === selectedAccountName)!

      config.data.set('accountId', id)
      config.data.set('accountName', name)

      this.log(`Account switched to ${chalk.bold.cyan(name)}`)
    } catch (err: any) {
      throw new Error(`Failed to switch account. ${err.message}`)
    }
  }
}
