import * as open from 'open'
import * as chalk from 'chalk'
import { Flags } from '@oclif/core'
import { BaseCommand } from './baseCommand'
import * as inquirer from 'inquirer'
import config from '../services/config'
import * as api from '../rest/api'
import type { Account } from '../rest/accounts'
import { AuthContext, type AuthMode } from '../auth'

const selectAccount = async (accounts: Array<Account>): Promise<Account> => {
  if (accounts.length === 1) {
    return accounts[0]
  }

  const { accountName } = await inquirer.prompt([
    {
      name: 'accountName',
      type: 'list',
      choices: accounts,
      message: 'Which account do you want to use?',
    },
  ])

  return accounts.find(({ name }) => name === accountName)!
}

export default class Login extends BaseCommand {
  static hidden = false
  static description = 'Login with a Checkly API Key'

  static flags = {
    'api-key': Flags.string({
      char: 'k',
      name: 'apiKey',
      description:
      'Checkly User API Key. \nIf you did not have one, create it at: https://app.checklyhq.com/account/api-keys',
    }),

    'account-id': Flags.string({
      char: 'i',
      name: 'accountId',
      description: 'Checkly account ID. (This flag is required if you are using -k (--api-key) flag',
    }),
  }

  private _checkExistingCredentials = async () => {
    if (config.hasEnvVarsConfigured()) {
      this.warn('`CHECKLY_API_KEY` ' +
      'or `CHECKLY_ACCOUNT_ID` environment variables are configured. You must delete them to use `npx checkly login`.')
      this.exit(0)
    }

    const hasValidCredentials = config.hasValidCredentials()

    if (hasValidCredentials) {
      const { setNewkey } = await inquirer.prompt([
        {
          name: 'setNewkey',
          type: 'confirm',
          message: `You are currently logged in to "${config.data.get('accountName')}". Do you want to log out and log in to a different account?`,
        },
      ])
      !setNewkey && this.exit(0)
    }
  }

  private _isLoginSuccess = async () => {
    await api.validateAuthentication()
    this.log('Welcome to @checkly/cli 🦝')
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Login)
    const { 'api-key': apiKey, 'account-id': accountId } = flags

    await this._checkExistingCredentials()

    if (apiKey) {
      if (!accountId) {
        throw new Error('The flag --account-id (-i) is required when using --api-key (-k)')
      }

      config.auth.set('apiKey', apiKey)
      config.data.set('accountId', accountId)

      await this._isLoginSuccess()
      this.exit(0)
    }

    const mode = await this.#promptForLoginOrSignUp()

    const authContext = new AuthContext(mode)

    const { openUrl } = await inquirer.prompt([
      {
        name: 'openUrl',
        type: 'confirm',
        message: `Do you allow to open the browser to continue with ${mode === 'login' ? 'login' : 'sign up'}?`,
      },
    ])

    if (!openUrl) {
      this.log(
        `Please open the following URL in your browser: \n\n${chalk.blueBright(
          authContext.authenticationUrl,
        )}`,
      )
    } else {
      await open(authContext.authenticationUrl)
    }

    const { key, name } = await authContext.getAuth0Credentials()

    config.auth.set('apiKey', key)

    const { data } = await api.accounts.getAll()

    const selectedAccount = await selectAccount(data)

    config.data.set('accountId', selectedAccount.id)
    config.data.set('accountName', selectedAccount.name)

    this.log(`Successfully logged in as ${chalk.blue.bold(name)}`)

    await this._isLoginSuccess()
    process.exit(0)
  }

  async #promptForLoginOrSignUp () {
    const { mode } = await inquirer.prompt<Record<string, AuthMode>>([
      {
        name: 'mode',
        type: 'list',
        message: 'Do you want to log in or sign up to Checkly?',
        choices: [{
          name: 'I want to log in with an existing Checkly account',
          value: 'login',
        }, {
          name: 'I want to sign up for a new Checkly account',
          value: 'signup',
        }],
      },
    ])

    return mode
  }
}
