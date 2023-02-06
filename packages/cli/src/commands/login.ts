import * as open from 'open'
import * as chalk from 'chalk'
import { Flags } from '@oclif/core'
import { BaseCommand } from './baseCommand'
import * as inquirer from 'inquirer'
import jwtDecode from 'jwt-decode'
import config from '../services/config'
import * as api from '../rest/api'
import type { Account } from '../rest/accounts'
import {
  generateAuthenticationUrl,
  getAccessToken,
  generatePKCE,
  startServer,
  getApiKey,
} from '../auth'

const checkExistingLogin = async () => {
  if (config.getApiKey()) {
    const { setNewkey } = await inquirer.prompt([
      {
        name: 'setNewkey',
        type: 'confirm',
        message: `Existing session with account ${chalk.bold.blue(
          config.data.get('accountName'),
        )}, do you want to continue?`,
      },
    ])

    !setNewkey && process.exit(0)
  }
}

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

  private _loginSuccess = () => {
    this.log('Welcome to @checkly/cli 🦝')
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Login)
    const { 'api-key': apiKey, 'account-id': accountId } = flags

    if (apiKey) {
      if (!accountId) {
        throw new Error('The flag --account-id (-i) is required when using --api-key (-k)')
      }

      config.auth.set('apiKey', apiKey)
      config.data.set('accountId', accountId)

      try {
        await api.accounts.get(accountId)
      } catch (err: any) {
        // remove stored credentials if fails
        config.auth.delete('apiKey')
        config.data.delete('accountId')
        const { status } = err.response
        if (status === 401) {
          throw new Error(`Authentication failed with Account ID "${accountId}" ` +
            `and API key "${apiKey?.substring(0, 8)}..."`)
        }
      }

      this._loginSuccess()
      this.exit(0)
    }

    await checkExistingLogin()
    const { codeChallenge, codeVerifier } = generatePKCE()
    const authServerUrl = generateAuthenticationUrl(
      codeChallenge,
      'openid profile',
      codeVerifier,
    )

    const { openUrl } = await inquirer.prompt([
      {
        name: 'openUrl',
        type: 'confirm',
        message: 'Do you allow to open the browser to continue with login?',
      },
    ])

    if (!openUrl) {
      this.log(
        `Please open the following URL in your browser: \n\n${chalk.blueBright(
          authServerUrl,
        )}`,
      )
    } else {
      await open(authServerUrl)
    }

    const code = await startServer(codeVerifier)

    const { access_token: accessToken, id_token: idToken } = await getAccessToken(code, codeVerifier)
    const { name } = jwtDecode<any>(idToken)
    const { key } = await getApiKey({
      accessToken,
      baseHost: api.getDefaults().baseURL,
    })

    config.auth.set('apiKey', key)

    const { data } = await api.accounts.getAll()

    const selectedAccount = await selectAccount(data)

    config.data.set('accountId', selectedAccount.id)
    config.data.set('accountName', selectedAccount.name)

    this.log(`Successfully logged in as ${chalk.blue.bold(name)}`)

    this._loginSuccess()
    process.exit(0)
  }
}
