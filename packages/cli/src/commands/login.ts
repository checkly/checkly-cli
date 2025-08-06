import open from 'open'
import chalk from 'chalk'
import { BaseCommand } from './baseCommand'
import prompts from 'prompts'
import config from '../services/config'
import * as api from '../rest/api'
import type { Account } from '../rest/accounts'
import { AuthContext } from '../auth'

export const selectAccount = async (
  accounts: Array<Account>, { onCancel }: { onCancel: () => void }): Promise<Account> => {
  if (accounts.length === 1) {
    return accounts[0]
  }

  const { selectedAccount } = await prompts({
    name: 'selectedAccount',
    type: 'select',
    choices: accounts.map(account => ({ title: account.name, value: account })),
    message: 'Which account do you want to use?',
  }, { onCancel })

  return selectedAccount
}

export default class Login extends BaseCommand {
  static hidden = false
  static description = 'Login to your Checkly account or create a new one.'

  private _checkExistingCredentials = async () => {
    if (config.hasEnvVarsConfigured()) {
      this.warn('`CHECKLY_API_KEY` '
        + 'or `CHECKLY_ACCOUNT_ID` environment variables are configured. You must delete them to use `npx checkly login`.')
      this.exit(0)
    }

    const hasValidCredentials = config.hasValidCredentials()

    if (hasValidCredentials) {
      const { setNewkey } = await prompts({
        name: 'setNewkey',
        type: 'confirm',
        message: `You are currently logged in to "${config.data.get('accountName')}". Do you want to log out and log in to a different account?`,
      })
      if (!setNewkey) {
        this.exit(0)
      }
    }
  }

  private _isLoginSuccess = async () => {
    await api.validateAuthentication()
    this.log('Welcome to the Checkly CLI')
  }

  async run (): Promise<void> {
    await this._checkExistingCredentials()

    const mode = await this.#promptForLoginOrSignUp()

    const onCancel = (): void => {
      this.error('Command cancelled.\n')
    }

    const authContext = new AuthContext(mode)

    const { openUrl } = await prompts({
      name: 'openUrl',
      type: 'confirm',
      message: `Do you want to open a browser window to continue with ${mode === 'login' ? 'login' : 'sign up'}?`,
      initial: true,
    })

    if (!openUrl) {
      this.log(
        `Please open the following URL in your browser: \n\n${chalk.cyan(
          authContext.authenticationUrl,
        )}`,
      )
    } else {
      await open(authContext.authenticationUrl)
    }

    const { key, name } = await authContext.getAuth0Credentials()

    config.auth.set('apiKey', key)

    const { data: accounts } = await api.accounts.getAll()

    const selectedAccount = await selectAccount(accounts, { onCancel })

    if (!selectedAccount) {
      this.warn('You must select a valid Checkly account name.')
      this.exit(1)
      return
    }

    config.data.set('accountId', selectedAccount.id)
    config.data.set('accountName', selectedAccount.name)

    this.log(`Successfully logged in as ${chalk.cyan.bold(name)}`)

    await this._isLoginSuccess()
    this.exit(0)
  }

  async #promptForLoginOrSignUp () {
    const { mode } = await prompts({
      name: 'mode',
      type: 'select',
      message: 'Do you want to log in or sign up to Checkly?',
      choices: [{
        title: 'I want to log in with an existing Checkly account',
        value: 'login',
      }, {
        title: 'I want to sign up for a new Checkly account',
        value: 'signup',
      }],
    })

    return mode
  }
}
