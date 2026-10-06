import open from 'open'
import chalk from 'chalk'
import { Flags } from '@oclif/core'
import prompts from 'prompts'

import { BaseCommand } from './baseCommand.js'
import config from '../services/config.js'
import * as api from '../rest/api.js'
import { UnauthorizedError } from '../rest/errors.js'
import type { Account } from '../rest/accounts.js'
import { AuthContext, type AuthMode } from '../auth/index.js'
import {
  DeviceFlow,
  DeviceFlowError,
  DeviceFlowNotAllowedError,
  type DeviceAuthorization,
} from '../auth/device-flow.js'
import { credentialsFromTokens, type Credentials } from '../auth/api-key.js'
import { canShowLoginCode, detectCliMode, isEnvFlagSet, type CliMode } from '../helpers/cli-mode.js'
import { activateAccount } from '../helpers/activate-account.js'
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

/** A device code kept between agent-mode runs, with the login server it belongs to. */
type PendingDeviceAuthorization = DeviceAuthorization & { authUrl: string }

/**
 * Structured "a human has to act" message for agents. Mirrors the shape used
 * by other non-interactive CLIs so an agent can relay the URL and code to
 * the user. For a device code it is the last line before the command exits;
 * running the command again after the approval collects it.
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
      description: 'Use this account instead of asking which one. When already logged in, switch to it '
        + 'without logging in again, like `checkly switch --account-id`.',
    }),
    'no-browser': Flags.boolean({
      description: 'Only print the login URL and code; do not try to open a browser. '
        + 'Also honoured through CHECKLY_NO_BROWSER=1, e.g. on headless hosts.',
      default: false,
    }),
  }

  #mode: CliMode = 'interactive'
  #openBrowser = true
  #inline = false

  async run (): Promise<void> {
    const { flags } = await this.parse(Login)
    const ok = await this.login({ accountId: flags['account-id'], openBrowser: !flags['no-browser'] })
    return this.exit(ok ? 0 : 1)
  }

  /**
   * Runs the whole login flow for the detected CLI mode and stores the
   * credentials. Returns false when the flow did not complete in agent mode
   * (the JSON error line has already been printed); throws otherwise.
   * Other commands call this with `inline: true` to log the user in before
   * they run; the login then writes to stderr so the command's own stdout
   * (e.g. `--output json`) stays clean.
   */
  async login (options: { accountId?: string, openBrowser?: boolean, inline?: boolean } = {}): Promise<boolean> {
    this.#mode = detectCliMode()
    this.#inline = options.inline ?? false
    this.#openBrowser = (options.openBrowser ?? true) && !isEnvFlagSet(process.env.CHECKLY_NO_BROWSER)

    if (config.hasEnvVarsConfigured()) {
      this.warn(`${commonMessages.envCredentialsConfigured} You must delete them to use \`npx checkly login\`.`)
      return true
    }

    // `--account-id` naming a different account switches to it with the
    // stored key; it is not a request to log in again.
    const switchingAccount = config.hasValidCredentials()
      && Boolean(options.accountId) && options.accountId !== config.getAccountId()

    if (config.hasValidCredentials() && !switchingAccount && !await this.#wantsToReplaceLogin()) {
      return true
    }

    try {
      // The stored key is reused when switching accounts, and when a previous
      // login stored it but stopped before an account was chosen (agent mode
      // with several accounts, or a cancelled account prompt).
      const reuseStoredKey = switchingAccount || (Boolean(config.getApiKey()) && !config.getAccountId())
      let userName = reuseStoredKey ? await this.#storedKeyUserName() : undefined
      const usingStoredKey = userName !== undefined
      if (userName === undefined) {
        if (this.#mode === 'ci') {
          this.error((reuseStoredKey ? 'The stored login is no longer valid and was removed. ' : '')
            + '`npx checkly login` needs a browser. In CI, set `CHECKLY_API_KEY` and `CHECKLY_ACCOUNT_ID` '
            + 'in the environment instead.', { exit: 1 })
        }
        if (this.#mode === 'interactive' && !canShowLoginCode()) {
          this.error((reuseStoredKey ? 'The stored login is no longer valid and was removed. ' : '')
            + '`npx checkly login` needs a terminal to show the login code and wait for it. '
            + 'Run it in a terminal, or set `CHECKLY_API_KEY` and `CHECKLY_ACCOUNT_ID` in the environment. '
            + 'If you are at a terminal that is not detected as one, set `CHECKLY_CLI_MODE=interactive`.', { exit: 1 })
        }
        if (reuseStoredKey && this.#mode === 'interactive') {
          this.#print('The stored login is no longer valid. Logging in again.')
        }
        const result = await this.#authenticate()
        if (result === 'pending') {
          return false
        }
        if (result === 'stored') {
          userName = await this.#storedKeyUserName()
          if (userName === undefined) {
            throw new Error('The login code was already used. Please run the login again.')
          }
        } else {
          this.#storeNewKey(result.key)
          userName = result.name
        }
      } else if (this.#mode === 'interactive' && !switchingAccount) {
        this.#print(`Continuing the login as ${chalk.bold(userName)}. `
          + 'Run `npx checkly logout` first to log in as someone else.')
      }

      const { data: accounts } = await api.accounts.getAll()
      const accountSummaries = accounts.map(({ id, name }) => ({ id, name }))
      const account = await this.#pickAccount(accounts, options.accountId, usingStoredKey)

      if (!account) {
        // Agent mode, several accounts, none requested: do not guess.
        // (CI never gets here; #pickAccount throws instead.)
        this.#print(JSON.stringify({
          status: 'action_required',
          reason: 'select_account',
          userActionRequired: false,
          message: 'Logged in, but this user belongs to several accounts. '
            + 'Choose one with `npx checkly login --account-id <id>`. '
            + 'To log in as someone else instead, run `npx checkly logout --force` first.',
          user: userName,
          accounts: accountSummaries,
          next: [{ command: 'npx checkly login --account-id <id>' }],
        }))
        return false
      }

      await activateAccount(account)

      if (this.#mode === 'agent') {
        this.#print(JSON.stringify({
          status: 'success',
          success: true,
          user: userName,
          accountId: account.id,
          accountName: account.name,
          accounts: accountSummaries,
        }))
      } else if (switchingAccount && usingStoredKey) {
        this.#print(`Switched to account ${chalk.cyan.bold(account.name)} (${account.id})`)
      } else {
        this.#print(`Successfully logged in as ${chalk.cyan.bold(userName)}`)
        this.#print('Welcome to the Checkly CLI')
      }
      return true
    } catch (error: any) {
      if (this.#mode !== 'agent') {
        throw error
      }
      this.#print(JSON.stringify({ status: 'error', success: false, error: error.message || String(error) }))
      return false
    }
  }

  /**
   * Stores the key of a fresh login and forgets any device code an agent
   * login left behind. The previous account belongs to the
   * previous key, possibly another user, so it is dropped first: if choosing
   * an account fails afterwards, the login is left unfinished (key without
   * account, which the next login resumes) instead of pairing the new key
   * with the old account.
   */
  #storeNewKey (key: string): void {
    config.data.delete('accountId')
    config.data.delete('accountName')
    config.auth.delete('pendingDeviceAuthorization')
    config.auth.set('apiKey', key)
  }

  /**
   * The name of the user the stored key belongs to, or undefined when the
   * key is no longer accepted (revoked or expired). A rejected key is
   * deleted so the caller authenticates again instead of reusing it.
   */
  async #storedKeyUserName (): Promise<string | undefined> {
    try {
      return (await api.user.get()).data.name
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        config.auth.delete('apiKey')
        return undefined
      }
      throw error
    }
  }

  /**
   * `checkly logout` asks for confirmation, which only a person at a terminal
   * can give; anywhere else it would exit without logging out.
   */
  #logoutCommand (): string {
    return this.#mode === 'interactive' ? 'npx checkly logout' : 'npx checkly logout --force'
  }

  #print (line: string): void {
    if (this.#inline) {
      this.logToStderr(line)
    } else {
      this.log(line)
    }
  }

  // ─── LOGIN STATE ────────────────────────────────────────────

  async #wantsToReplaceLogin (): Promise<boolean> {
    const accountId = config.data.get('accountId')
    const accountName = config.data.get('accountName')

    if (this.#mode !== 'interactive') {
      if (this.#mode === 'agent') {
        this.#print(JSON.stringify({ status: 'success', success: true, alreadyLoggedIn: true, accountId, accountName }))
      } else {
        this.#print(`Already logged in to "${accountName}".`)
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

  /**
   * Returns the new credentials, or:
   * - 'pending' when an agent-mode login has shown the code and returned
   *   without waiting for the user (the next run collects it);
   * - 'stored' when another process completed this login with the same code
   *   and stored its key.
   */
  async #authenticate (): Promise<Credentials | 'pending' | 'stored'> {
    const deviceFlow = new DeviceFlow()

    if (this.#mode === 'agent') {
      const pending = this.#pendingAuthorization()
      if (pending) {
        return this.#collectPendingAuthorization(deviceFlow, pending)
      }
    }

    let authorization: DeviceAuthorization
    try {
      authorization = await deviceFlow.requestAuthorization()
    } catch (error) {
      if (error instanceof DeviceFlowNotAllowedError) {
        return this.#authenticateWithBrowserCallback()
      }
      throw error
    }

    if (this.#mode === 'agent') {
      // Agents usually show a command's output only once it exits, so
      // waiting here would hide the code until it expired. Keep the code and
      // return; the next login (or authenticated command) collects it.
      const stored: PendingDeviceAuthorization = { ...authorization, authUrl: config.getAuthUrl() }
      config.auth.set('pendingDeviceAuthorization', stored)
    }

    this.#announceDeviceCode(authorization)
    await this.#tryOpenBrowser(authorization.verificationUriComplete)

    if (this.#mode === 'agent') {
      return 'pending'
    }
    if (this.#mode === 'interactive') {
      this.#print(chalk.dim('Waiting for you to finish in the browser...'))
    }

    const tokens = await deviceFlow.pollForTokens(authorization)
    return credentialsFromTokens(tokens)
  }

  /** The stored device code, if it is still usable against this login server. */
  #pendingAuthorization (): DeviceAuthorization | undefined {
    const stored = config.auth.get('pendingDeviceAuthorization') as PendingDeviceAuthorization | undefined
    if (!stored) {
      return undefined
    }
    if (stored.authUrl !== config.getAuthUrl() || !(stored.expiresAt > Date.now())) {
      config.auth.delete('pendingDeviceAuthorization')
      return undefined
    }
    return stored
  }

  /**
   * Checks once whether the user has approved the stored code. Still
   * waiting: show the same code again and return 'pending'.
   */
  async #collectPendingAuthorization (
    deviceFlow: DeviceFlow, pending: DeviceAuthorization,
  ): Promise<Credentials | 'pending' | 'stored'> {
    let tokens
    try {
      tokens = await deviceFlow.pollOnce(pending)
    } catch (error) {
      // Denied, expired or already used: the code is done either way.
      config.auth.delete('pendingDeviceAuthorization')
      if (error instanceof DeviceFlowError && config.getApiKey()) {
        return 'stored'
      }
      throw error
    }

    if (!tokens) {
      this.#announceDeviceCode(pending)
      return 'pending'
    }

    config.auth.delete('pendingDeviceAuthorization')
    return credentialsFromTokens(tokens)
  }

  #announceDeviceCode (authorization: DeviceAuthorization): void {
    this.#announce({
      status: 'action_required',
      reason: 'login',
      userActionRequired: true,
      message: `Open ${authorization.verificationUri} in a browser on any device and enter the code `
        + `${authorization.userCode}. Once the user has approved, run this command again.`,
      verification_uri: authorization.verificationUri,
      verification_uri_complete: authorization.verificationUriComplete,
      user_code: authorization.userCode,
      expires_in: Math.max(0, Math.round((authorization.expiresAt - Date.now()) / 1000)),
    }, [
      `Visit ${chalk.bold(authorization.verificationUri)} and enter the code ${chalk.bold(authorization.userCode)}`,
      chalk.dim(`Or open ${authorization.verificationUriComplete}`),
    ])
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
        this.#print(`Please open the following URL in your browser: \n\n${chalk.cyan(authContext.authenticationUrl)}`)
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
      await this.#tryOpenBrowser(authContext.authenticationUrl)
    }

    return authContext.getAuth0Credentials()
  }

  #announce (payload: ActionRequired, interactiveLines: string[]): void {
    if (this.#mode === 'agent') {
      this.#print(JSON.stringify(payload))
      return
    }
    for (const line of interactiveLines) {
      this.#print(line)
    }
  }

  async #tryOpenBrowser (url: string): Promise<void> {
    if (!this.#openBrowser) {
      return
    }
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

  /**
   * Returns undefined only in agent mode when several accounts are available
   * and none was requested: the caller reports the choice instead of guessing.
   */
  async #pickAccount (
    accounts: Account[], requestedId: string | undefined, usingStoredKey: boolean,
  ): Promise<Account | undefined> {
    const available = accounts.map(a => `${a.name} (${a.id})`).join(', ')
    if (requestedId) {
      const match = accounts.find(account => account.id === requestedId)
      if (!match) {
        // With the stored key the account list is that user's; the requested
        // account may belong to another identity the user also logs in with.
        throw new Error(`No account with id "${requestedId}" is available to this user. `
          + `Available: ${available}`
          + (usingStoredKey ? `. To log in as a different user, run \`${this.#logoutCommand()}\` first.` : ''))
      }
      return match
    }

    if (accounts.length === 0) {
      throw new Error('This user has no Checkly accounts.')
    }

    if (accounts.length === 1) {
      return accounts[0]!
    }

    if (this.#mode === 'ci') {
      throw new Error('This user belongs to several accounts: '
        + `${available}. `
        + 'Choose one with `npx checkly login --account-id <id>`, or set `CHECKLY_API_KEY` and '
        + '`CHECKLY_ACCOUNT_ID` in the environment.')
    }

    if (this.#mode === 'agent') {
      return undefined
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
