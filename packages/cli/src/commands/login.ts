import open from 'open'
import chalk from 'chalk'
import { Flags } from '@oclif/core'
import prompts from 'prompts'

import { BaseCommand } from './baseCommand.js'
import config from '../services/config.js'
import * as api from '../rest/api.js'
import type { Account } from '../rest/accounts.js'
import { AuthContext, type AuthMode } from '../auth/index.js'
import { DeviceFlow, DeviceFlowNotAllowedError, type DeviceAuthorization } from '../auth/device-flow.js'
import { credentialsFromTokens, type Credentials } from '../auth/api-key.js'
import { detectCliMode, type CliMode } from '../helpers/cli-mode.js'
import commonMessages from '../messages/common-messages.js'

export const selectAccount = async (
  accounts: Array<Account>, { onCancel }: { onCancel: () => void }): Promise<Account> => {
  const { selectedAccount } = await prompts({
    name: 'selectedAccount',
    type: 'select',
    choices: accounts.map(account => ({ title: account.name, value: account })),
    message: 'Which account do you want to use?',
  }, { onCancel })

  return selectedAccount
}

/**
 * Structured "a human has to act" message for agents. Mirrors the shape used
 * by other non-interactive CLIs so an agent can relay the URL and code to
 * the user and keep waiting.
 */
interface ActionRequired {
  status: 'action_required'
  reason: 'login'
  userActionRequired: true
  message: string
  verification_uri: string
  verification_uri_complete?: string
  user_code?: string
  expires_in?: number
}

export default class Login extends BaseCommand {
  static hidden = false
  static idempotent = true
  static description = 'Login to your Checkly account or create a new one.'
  static examples = [
    '$ npx checkly login',
    '$ npx checkly login --account-id <id>',
  ]

  static flags = {
    'account-id': Flags.string({
      description: 'Select this account after logging in instead of asking (or defaulting to the first one).',
    }),
  }

  #mode: CliMode = 'interactive'

  async run (): Promise<void> {
    const { flags } = await this.parse(Login)
    const ok = await this.login({ accountId: flags['account-id'] })
    return this.exit(ok ? 0 : 1)
  }

  /**
   * Runs the whole login flow for the detected CLI mode and stores the
   * credentials. Returns false when the flow did not complete in agent mode
   * (the JSON error line has already been printed); throws otherwise.
   * Other commands call this to log the user in inline.
   */
  async login (options: { accountId?: string } = {}): Promise<boolean> {
    this.#mode = detectCliMode()

    if (config.hasEnvVarsConfigured()) {
      this.warn(`${commonMessages.envCredentialsConfigured} You must delete them to use \`npx checkly login\`.`)
      return true
    }

    if (config.hasValidCredentials() && !await this.#wantsToReplaceLogin()) {
      return true
    }

    if (this.#mode === 'ci') {
      this.error('`npx checkly login` needs a browser. In CI, set `CHECKLY_API_KEY` and `CHECKLY_ACCOUNT_ID` '
        + 'in the environment instead.', { exit: 1 })
    }

    try {
      const credentials = await this.#authenticate()
      config.auth.set('apiKey', credentials.key)

      const { data: accounts } = await api.accounts.getAll()
      const account = await this.#pickAccount(accounts, options.accountId)

      config.data.set('accountId', account.id)
      config.data.set('accountName', account.name)

      await api.validateAuthentication()

      if (this.#mode === 'agent') {
        this.log(JSON.stringify({
          success: true,
          user: credentials.name,
          accountId: account.id,
          accountName: account.name,
          accounts: accounts.map(({ id, name }) => ({ id, name })),
        }))
      } else {
        this.log(`Successfully logged in as ${chalk.cyan.bold(credentials.name)}`)
        this.log('Welcome to the Checkly CLI')
      }
      return true
    } catch (error: any) {
      if (this.#mode !== 'agent') {
        throw error
      }
      this.log(JSON.stringify({ success: false, error: error.message || String(error) }))
      return false
    }
  }

  // ─── LOGIN STATE ────────────────────────────────────────────

  async #wantsToReplaceLogin (): Promise<boolean> {
    const accountId = config.data.get('accountId')
    const accountName = config.data.get('accountName')

    if (this.#mode !== 'interactive') {
      if (this.#mode === 'agent') {
        this.log(JSON.stringify({ success: true, alreadyLoggedIn: true, accountId, accountName }))
      } else {
        this.log(`Already logged in to "${accountName}".`)
      }
      return false
    }

    const { setNewkey } = await prompts({
      name: 'setNewkey',
      type: 'confirm',
      message: `You are currently logged in to "${accountName}". Do you want to log out and log in to a different account?`,
    })
    return Boolean(setNewkey)
  }

  // ─── AUTHENTICATION ─────────────────────────────────────────

  async #authenticate (): Promise<Credentials> {
    const deviceFlow = new DeviceFlow()

    let authorization: DeviceAuthorization
    try {
      authorization = await deviceFlow.requestAuthorization()
    } catch (error) {
      if (error instanceof DeviceFlowNotAllowedError) {
        return this.#authenticateWithBrowserCallback()
      }
      throw error
    }

    this.#announce({
      status: 'action_required',
      reason: 'login',
      userActionRequired: true,
      message: `Open ${authorization.verificationUri} in a browser on any device and enter the code ${authorization.userCode}.`,
      verification_uri: authorization.verificationUri,
      verification_uri_complete: authorization.verificationUriComplete,
      user_code: authorization.userCode,
      expires_in: Math.max(0, Math.round((authorization.expiresAt - Date.now()) / 1000)),
    }, [
      `Visit ${chalk.bold(authorization.verificationUri)} and enter the code ${chalk.bold(authorization.userCode)}`,
      chalk.dim(`Or open ${authorization.verificationUriComplete}`),
    ])
    await this.#openBrowser(authorization.verificationUriComplete)

    if (this.#mode === 'interactive') {
      this.log(chalk.dim('Waiting for you to finish in the browser...'))
    }

    const tokens = await deviceFlow.pollForTokens(authorization)
    return credentialsFromTokens(tokens)
  }

  /**
   * Authorization-code flow with a callback server on localhost. Used while
   * the device grant is not enabled for the CLI client. Only works when the
   * browser runs on the same machine as the CLI.
   */
  async #authenticateWithBrowserCallback (): Promise<Credentials> {
    const mode: AuthMode = this.#mode === 'interactive'
      ? await this.#promptForLoginOrSignUp()
      : 'any'
    const authContext = new AuthContext(mode)

    if (this.#mode === 'interactive') {
      const { openUrl } = await prompts({
        name: 'openUrl',
        type: 'confirm',
        message: `Do you want to open a browser window to continue with ${mode === 'signup' ? 'sign up' : 'login'}?`,
        initial: true,
      })

      if (openUrl) {
        await open(authContext.authenticationUrl)
      } else {
        this.log(`Please open the following URL in your browser: \n\n${chalk.cyan(authContext.authenticationUrl)}`)
      }
    } else {
      this.#announce({
        status: 'action_required',
        reason: 'login',
        userActionRequired: true,
        message: 'Ask the user to open the URL in a browser on the same machine as this CLI '
          + '(it completes through a local callback).',
        verification_uri: authContext.authenticationUrl,
      }, [])
      await this.#openBrowser(authContext.authenticationUrl)
    }

    return authContext.getAuth0Credentials()
  }

  #announce (payload: ActionRequired, interactiveLines: string[]): void {
    if (this.#mode === 'agent') {
      this.log(JSON.stringify(payload))
      return
    }
    for (const line of interactiveLines) {
      this.log(line)
    }
  }

  async #openBrowser (url: string): Promise<void> {
    try {
      await open(url)
    } catch {
      // Best effort: the URL and code are already on screen.
    }
  }

  async #promptForLoginOrSignUp (): Promise<AuthMode> {
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

  // ─── ACCOUNT SELECTION ──────────────────────────────────────

  async #pickAccount (accounts: Account[], requestedId: string | undefined): Promise<Account> {
    if (requestedId) {
      const match = accounts.find(account => account.id === requestedId)
      if (!match) {
        throw new Error(`No account with id "${requestedId}" is available to this user. `
          + `Available: ${accounts.map(a => `${a.name} (${a.id})`).join(', ')}`)
      }
      return match
    }

    if (accounts.length === 0) {
      throw new Error('This user has no Checkly accounts.')
    }

    if (accounts.length === 1 || this.#mode !== 'interactive') {
      return accounts[0]!
    }

    const selected = await selectAccount(accounts, {
      onCancel: () => this.error('Command cancelled.\n'),
    })
    if (!selected) {
      throw new Error('You must select a valid Checkly account name.')
    }
    return selected
  }
}
