import * as open from 'open'
import * as chalk from 'chalk'
import { Command, Flags } from '@oclif/core'
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

const loginSuccess = () => {
  console.info('Welcome to @checkly/cli 🦝')
}

export default class Login extends Command {
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

  async run (): Promise<void> {
    const { flags } = await this.parse(Login)
    const { 'api-key': apiKey, 'account-id': accountId } = flags

    if (apiKey) {
      if (!accountId) {
        console.error(
          'The flag --account-id (-i) is required when using --api-key (-k)',
        )
        this.exit(1)
      }

      config.auth.set('apiKey', apiKey)
      config.data.set('accountId', accountId)

      loginSuccess()
      this.exit(0)
    }

    await checkExistingLogin()
    const { codeChallenge, codeVerifier } = generatePKCE()
    const { authListener, serverUri } = await startServer(codeVerifier)
    const authCodePromise: Promise<string> = new Promise((resolve, reject) => {
      authListener.on('successful-auth', (code) => resolve(code))
      authListener.on('error', () => reject())
    })
    const authServerUrl = generateAuthenticationUrl(
      codeChallenge,
      'openid profile',
      codeVerifier,
      serverUri,
    )

    const { openUrl } = await inquirer.prompt([
      {
        name: 'openUrl',
        type: 'confirm',
        message: 'Do you allow to open the browser to continue with login?',
      },
    ])

    if (!openUrl) {
      console.info(
        `Please open the following URL in your browser: \n\n${chalk.blueBright(
          authServerUrl,
        )}`,
      )
    } else {
      await open(authServerUrl)
    }
    const code = await authCodePromise
    const { access_token: accessToken, id_token: idToken } = await getAccessToken(code, codeVerifier, serverUri)
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

    console.info(`Successfully logged in as ${chalk.blue.bold(name)}`)

    loginSuccess()
    process.exit(0)
  }
}
