import * as open from 'open'
import * as chalk from 'chalk'
import { BaseCommand } from './baseCommand'
import * as prompts from 'prompts'
import config from '../services/config'
import * as api from '../rest/api'
import type { Account } from '../rest/accounts'
import { AuthContext } from '../auth'

export default class Login extends BaseCommand {
  static hidden = false
  static description = 'Login to your Checkly account or create a new one.'

  private _checkExistingCredentials = async () => {
    if (config.hasEnvVarsConfigured()) {
      this.warn('`CHECKLY_API_KEY` ' +
      'or `CHECKLY_ACCOUNT_ID` environment variables are configured. You must delete them to use `npx checkly login`.')
      this.exit(0)
    }

    const hasValidCredentials = config.hasValidCredentials()

    if (hasValidCredentials) {
      const { setNewkey } = await prompts({
        name: 'setNewkey',
        type: 'confirm',
        message: `You are currently logged in to "${config.data.get('accountName')}". Do you want to log out and log in to a different account?`,
      }, { onCancel: () => this.exit(1) })
      !setNewkey && this.exit(0)
    }
  }

  private _isLoginSuccess = async () => {
    await api.validateAuthentication()
    this.log('Welcome to the Checkly CLI')
  }

  private selectAccount = async (accounts: Array<Account>): Promise<Account|undefined> => {
    if (accounts.length === 1) {
      return accounts[0]
    }

    const { accountName } = await prompts({
      name: 'accountName',
      type: 'select',
      choices: accounts.map(({ name }) => ({ title: name, value: name })),
      message: 'Which account do you want to use?',
    }, { onCancel: () => this.exit(1) })

    const selectedAccount = accounts.find(({ name }) => name === accountName)
    return selectedAccount
  }

  async run (): Promise<void> {
    await this._checkExistingCredentials()

    const mode = await this.#promptForLoginOrSignUp()

    const authContext = new AuthContext(mode)

    const { openUrl } = await prompts({
      name: 'openUrl',
      type: 'confirm',
      message: `Do you want to open a browser window to continue with ${mode === 'login' ? 'login' : 'sign up'}?`,
      initial: true,
    }, { onCancel: () => this.exit(1) })

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

    const { data } = await api.accounts.getAll()

    const selectedAccount = await this.selectAccount(data)

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
    }, { onCancel: () => this.exit(1) })

    return mode
  }
}
