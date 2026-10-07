import open from 'open'
import chalk from 'chalk'
import { Flags } from '@oclif/core'
import prompts from 'prompts'

import { BaseCommand } from './baseCommand.js'
import config from '../services/config.js'
import * as api from '../rest/api.js'
import {
  ApiError,
  ForbiddenError,
  MissingResponseError,
  NotFoundError,
  ProxyConnectionError,
  UnauthorizedError,
} from '../rest/errors.js'
import type { Account } from '../rest/accounts.js'
import { AuthContext, type AuthMode } from '../auth/index.js'
import {
  DeviceFlow,
  DeviceFlowError,
  DeviceFlowNotAllowedError,
  type DeviceAuthorization,
} from '../auth/device-flow.js'
import { credentialsFromTokens, type Credentials } from '../auth/api-key.js'
import { isPersonAtTerminal, detectCliMode, isEnvFlagSet, type CliMode } from '../helpers/cli-mode.js'
import { activateAccount } from '../helpers/activate-account.js'
import commonMessages from '../messages/common-messages.js'
import { detectPackageManager } from '../services/check-parser/package-files/package-manager.js'
import { getChecklyConfigFile } from '../services/checkly-config-loader.js'
import { shellQuote } from '../services/shell.js'

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
 * The `reason` of an agent-mode error line. A closed set that agents branch
 * on; the skill documents every value, so keep the two in step.
 */
type ErrorReason =
  | 'access_denied' | 'expired_token' | 'code_used' | 'invalid_response' | 'network_error'
  | 'account_not_found' | 'no_accounts' | 'api_error' | 'env_credentials' | 'login_failed'

/** A login failure with the `reason` code agent-mode output reports for it. */
class LoginError extends Error {
  constructor (readonly reason: ErrorReason, message: string) {
    super(message)
    this.name = 'LoginError'
  }
}

/**
 * Classifies a login failure: the device-flow outcomes (`network_error` when
 * the login server cannot be reached), the account problems raised by the
 * login itself, `api_error` for a failed or unreachable Checkly API and
 * `login_failed` for anything else. (`env_credentials` is
 * reported before any of these can happen.)
 */
function errorReason (error: unknown): ErrorReason {
  if (error instanceof LoginError) {
    return error.reason
  }
  if (error instanceof DeviceFlowError) {
    switch (error.code) {
      case 'access_denied':
      case 'expired_token':
      case 'invalid_response':
      case 'network_error':
        return error.code
      case 'invalid_grant':
        return 'code_used'
    }
    return 'login_failed'
  }
  // validateAuthentication() rewords rejected stored credentials into a plain
  // Error that keeps the API error as its cause.
  const apiError = error instanceof Error && error.cause instanceof ApiError ? error.cause : error
  if (apiError instanceof ApiError || apiError instanceof MissingResponseError
    || apiError instanceof ProxyConnectionError) {
    return 'api_error'
  }
  return 'login_failed'
}

/**
 * What to do after logging in, in the current directory's package manager:
 * run the checks of a Checkly project, or set one up. Undefined when that
 * cannot be worked out; the hint is never worth failing a login over.
 */
async function nextStepHint (): Promise<string | undefined> {
  try {
    const packageManager = await detectPackageManager(process.cwd())
    const command = (subcommand: string) => packageManager.execCommand(['checkly', subcommand]).unsafeDisplayCommand
    return await getChecklyConfigFile()
      ? `To run your checks, run \`${command('test')}\`.`
      : `To create checks for a project, run \`${command('init')}\`.`
  } catch {
    return undefined
  }
}

/** `https://auth.checklyhq.com/activate` as `auth.checklyhq.com/activate`. */
function withoutScheme (url: string): string {
  return url.replace(/^https?:\/\//, '')
}

/** What Auth0 says when the user cancels on the activation page. */
const AUTH0_CANCELLED_MESSAGE = 'User did not confirm their request'

/**
 * The message of a login failure, in our own words for a login cancelled in
 * the browser. Other denials (e.g. by a tenant rule) keep the login
 * server's message, the only place their reason appears.
 */
function errorMessage (error: any): string {
  if (error instanceof DeviceFlowError && error.code === 'access_denied'
    && error.message === AUTH0_CANCELLED_MESSAGE) {
    return 'The login was cancelled in the browser.'
  }
  // An OAuth error without a reason of its own: name its code, the only
  // thing that identifies it for support.
  if (error instanceof DeviceFlowError && errorReason(error) === 'login_failed'
    && !error.message.includes(`(${error.code})`)) {
    return `The login server refused the login: ${error.message} (${error.code})`
  }
  return error?.message || String(error)
}

// An agent relays a stored code again only while there is still time to
// approve it.
const MIN_RELAY_TIME_MS = 60_000

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
  reason: 'login_required'
  userActionRequired: true
  message: string
  verification_uri?: string
  verification_uri_complete?: string
  user_code?: string
  expires_in?: number
  next?: Array<{ command: string, when?: string }>
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
  // Why a stored login stopped working, for the agent to pass on with the
  // next step (a new code, account selection or success).
  #notice?: string
  // Whether the interactive output so far ends with an empty line, so the
  // next block is separated by exactly one.
  #atBlankLine = false
  // `--account-id` as given, so the command to run after approval keeps it.
  #requestedAccountId?: string

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
    this.#notice = undefined
    this.#requestedAccountId = options.accountId
    this.#openBrowser = (options.openBrowser ?? true) && !isEnvFlagSet(process.env.CHECKLY_NO_BROWSER)

    if (config.hasEnvVarsConfigured()) {
      const message = `${commonMessages.envCredentialsConfigured} You must delete them to use \`npx checkly login\`.`
      if (this.#mode === 'agent') {
        // Not a success: the variables may be incomplete or wrong, and only
        // the user can remove them.
        const reason: ErrorReason = 'env_credentials'
        this.#print(JSON.stringify({ status: 'error', reason, userActionRequired: true, message }))
        return false
      }
      this.warn(message)
      return true
    }

    // `--account-id` naming a different account switches to it with the
    // stored key; it is not a request to log in again.
    const switchingAccount = config.hasValidCredentials()
      && Boolean(options.accountId) && options.accountId !== config.getAccountId()

    try {
      // A stored login is only kept as it is while it still works. Dropping an
      // unusable account sends the flow below into the stored-key resume path:
      // account selection with a working key, a new login otherwise.
      if (config.hasValidCredentials() && !switchingAccount) {
        const storedAccount = await this.#checkStoredAccount()
        if (storedAccount.usable && !await this.#wantsToReplaceLogin(storedAccount.name)) {
          return true
        }
        if (!storedAccount.usable) {
          this.#notice = `Account "${storedAccount.name}" is no longer available with the stored login.`
          if (this.#mode !== 'agent') {
            this.#print(this.#notice)
          }
        }
      }

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
        if (this.#mode === 'interactive' && !isPersonAtTerminal()) {
          this.error((reuseStoredKey ? 'The stored login is no longer valid and was removed. ' : '')
            + '`npx checkly login` needs a terminal to show the login code and wait for it. '
            + 'Run it in a terminal, or set `CHECKLY_API_KEY` and `CHECKLY_ACCOUNT_ID` in the environment. '
            + 'If you are at a terminal that is not detected as one, set `CHECKLY_CLI_MODE=interactive`; '
            + 'AI agents set `CHECKLY_CLI_MODE=agent` instead.', { exit: 1 })
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
            throw new LoginError('code_used', 'The login code was already used. Please run the login again.')
          }
        } else {
          this.#storeNewKey(result.key)
          userName = result.name
        }
      } else if (this.#mode === 'interactive' && !switchingAccount && !this.#notice) {
        this.#print(`Continuing the login as ${chalk.bold(userName)}. `
          + 'Run `npx checkly logout` first to log in as someone else.')
      }

      const { data: accounts } = await api.accounts.getAll()
      const accountSummaries = accounts.map(({ id, name }) => ({ id, name }))
      const account = await this.#pickAccount(accounts, options.accountId, usingStoredKey)

      if (!account) {
        // Agent mode, several accounts, none requested: do not guess.
        // (CI never gets here; #pickAccount throws instead.)
        // A person has to choose; the agent must not pick an account itself.
        this.#print(JSON.stringify({
          status: 'action_required',
          reason: 'select_account',
          userActionRequired: true,
          message: (this.#notice ? `${this.#notice} ` : '')
            + 'Logged in, but this user belongs to several accounts. Ask the user which one to use, then run '
            + '`npx checkly login --account-id <id>`'
            + (this.#inline ? ' and run the original command again' : '')
            + '. To log in as someone else instead, run `npx checkly logout` first.',
          user: userName,
          choices: accountSummaries,
          next: [{ command: 'npx checkly login --account-id <id>' }],
        }))
        return false
      }

      await activateAccount(account)

      const switched = switchingAccount && usingStoredKey
      if (this.#mode === 'agent') {
        this.#print(JSON.stringify({
          status: 'success',
          reason: switched ? 'account_switched' : 'logged_in',
          message: (this.#notice ? `${this.#notice} ` : '') + (switched
            ? `Switched to account "${account.name}".`
            : `Logged in as ${userName} to account "${account.name}".`),
          user: userName,
          accountId: account.id,
          accountName: account.name,
        }))
      } else if (switched) {
        this.#print(`Switched to account ${chalk.cyan.bold(account.name)} (${account.id})`)
      } else {
        if (this.#mode === 'interactive' && !this.#atBlankLine) {
          this.#print('')
        }
        this.#print(`Logged in as ${chalk.cyan.bold(userName)} to ${chalk.cyan.bold(account.name)}.`)
        // A login another command started goes straight on to that command.
        const hint = this.#mode === 'interactive' && !this.#inline ? await nextStepHint() : undefined
        if (hint) {
          this.#print('')
          this.#print(hint)
        }
      }
      return true
    } catch (error: any) {
      if (this.#mode !== 'agent') {
        // Expected login failures, including any answer from the login
        // server, get a plain message; anything else keeps its stack for
        // debugging.
        if (error instanceof DeviceFlowError || errorReason(error) !== 'login_failed') {
          this.error(errorMessage(error), { exit: 1 })
        }
        throw error
      }
      this.#print(JSON.stringify({ status: 'error', reason: errorReason(error), message: errorMessage(error) }))
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

  #print (line: string): void {
    this.#atBlankLine = line === ''
    if (this.#inline) {
      this.logToStderr(line)
    } else {
      this.log(line)
    }
  }

  // ─── LOGIN STATE ────────────────────────────────────────────

  async #wantsToReplaceLogin (accountName: string): Promise<boolean> {
    const accountId = config.data.get('accountId')

    if (this.#mode !== 'interactive') {
      if (this.#mode === 'agent') {
        this.#print(JSON.stringify({
          status: 'success',
          reason: 'already_logged_in',
          message: `Already logged in to account "${accountName}".`,
          accountId,
          accountName,
        }))
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

  /**
   * Checks the stored key against the stored account. If it no longer works
   * (key revoked, access removed, account deleted), drops the stored account,
   * so the stored key is then checked like that of an unfinished login. Other
   * failures, such as the API being unreachable, are thrown. Returns the
   * account's name either way.
   */
  async #checkStoredAccount (): Promise<{ usable: boolean, name: string }> {
    const accountId = config.getAccountId()
    try {
      const { data: account } = await api.accounts.get(accountId)
      // Older CLI versions' `checkly switch` stored only the new account's
      // id, so the stored name can belong to another account.
      if (account.name !== config.data.get('accountName')) {
        config.data.set('accountName', account.name)
      }
      return { usable: true, name: account.name }
    } catch (error) {
      const unusable = error instanceof UnauthorizedError
        || error instanceof ForbiddenError
        || error instanceof NotFoundError
      if (!unusable) {
        throw error
      }
      const accountName = config.data.get('accountName') as string | undefined
      config.data.delete('accountId')
      config.data.delete('accountName')
      return { usable: false, name: accountName || accountId }
    }
  }

  // ─── AUTHENTICATION ─────────────────────────────────────────

  /**
   * Returns the new credentials, or:
   * - 'pending' when an agent-mode login has shown the code and returned
   *   without waiting for the user (the next run collects it), or has sent
   *   the agent to `npx checkly login` (nothing stored to collect);
   * - 'stored' when another process completed this login with the same code
   *   and stored its key.
   */
  async #authenticate (): Promise<Credentials | 'pending' | 'stored'> {
    const deviceFlow = new DeviceFlow()

    let authorization: DeviceAuthorization
    try {
      const pending = this.#mode === 'agent' ? this.#pendingAuthorization() : undefined
      if (pending) {
        const collected = await this.#collectPendingAuthorization(deviceFlow, pending)
        if (collected !== 'expiring') {
          return collected
        }
      }
      authorization = await deviceFlow.requestAuthorization()
    } catch (error) {
      // The device grant is not enabled, or was turned off (rolled back)
      // after a stored code was issued; that code is gone either way.
      if (error instanceof DeviceFlowNotAllowedError) {
        return this.#authenticateWithBrowserCallback()
      }
      throw error
    }

    if (this.#mode === 'agent') {
      // Agents usually show a command's output only once it exits, so
      // waiting here would hide the code until it expired. Keep the code and
      // return; the next login (or authenticated command) collects it.
      // Commands an agent runs in parallel before it knows it is logged out
      // each get here; the first code stored wins, so the user approves the
      // one code every later run collects.
      const storedMeanwhile = this.#pendingAuthorization()
      if (storedMeanwhile) {
        authorization = storedMeanwhile
      } else {
        const stored: PendingDeviceAuthorization = { ...authorization, authUrl: config.getAuthUrl() }
        config.auth.set('pendingDeviceAuthorization', stored)
      }
    }

    // A login an agent's command starts on its own (often just a `whoami`
    // check) must not pop up a browser tab the user did not ask for; the
    // agent relays the URL instead. An explicit `checkly login` opens it for
    // a code this run shows for the first time, whether it requested it or
    // took it over from a parallel run (not when it shows a stored one again).
    const browserOpened = !(this.#mode === 'agent' && this.#inline)
      && await this.#tryOpenBrowser(authorization.verificationUriComplete)
    this.#announceDeviceCode(authorization, undefined, browserOpened)

    if (this.#mode === 'agent') {
      return 'pending'
    }

    const tokens = await this.#whileWaiting('Waiting for you to finish in the browser', report =>
      deviceFlow.pollForTokens(authorization, {
        onUnexpectedAnswers: failure => report(`Still waiting: the last answer was ${failure}.`),
      }))
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
   * waiting: show the same code again and return 'pending', or return
   * 'expiring' when it is about to expire.
   */
  async #collectPendingAuthorization (
    deviceFlow: DeviceFlow, pending: DeviceAuthorization,
  ): Promise<Credentials | 'pending' | 'stored' | 'expiring'> {
    let result
    try {
      result = await deviceFlow.pollOnce(pending)
    } catch (error) {
      // Denied, expired or already used: the code is done either way.
      config.auth.delete('pendingDeviceAuthorization')
      if (error instanceof DeviceFlowError && config.getApiKey()) {
        return 'stored'
      }
      throw error
    }

    if (!result.tokens) {
      // The login server says it is not approved, and too little time is left
      // for the agent to relay it and the user to approve: the caller requests
      // a new code. After a failed request the code is kept, since it may
      // have been approved.
      if (!result.failure && pending.expiresAt - Date.now() < MIN_RELAY_TIME_MS) {
        config.auth.delete('pendingDeviceAuthorization')
        return 'expiring'
      }
      // Without this, an agent whose user has already approved would be told
      // to run the command again with nothing to suggest that it was the
      // login server, not the user, that has not answered yet.
      const problem = result.failure
        ? `The last request to the login server failed (${result.failure}), so an approval may not have been seen yet; `
        + 'run this command again in a moment.'
        : undefined
      this.#announceDeviceCode(pending, problem)
      return 'pending'
    }

    config.auth.delete('pendingDeviceAuthorization')
    return credentialsFromTokens(result.tokens)
  }

  // The login pages also offer sign-up, and logging in with a new identity
  // creates the Checkly user (see exchangeAccessTokenForApiKey()).
  static readonly #signUpHint = 'New to Checkly? You can sign up on the same page.'

  /**
   * `browserOpened` only shapes the interactive lines: the pre-filled link is
   * shown when no browser was opened, for the user to open themselves.
   */
  #announceDeviceCode (authorization: DeviceAuthorization, problem?: string, browserOpened = false): void {
    this.#announce({
      status: 'action_required',
      reason: 'login_required',
      userActionRequired: true,
      message: (this.#notice ? `${this.#notice} ` : '')
        + `Open ${authorization.verificationUri} in a browser on any device and enter the code `
        + `${authorization.userCode}. Once the user has approved, run this command again.`
        + (problem ? ` ${problem}` : '') + ` ${Login.#signUpHint}`,
      verification_uri: authorization.verificationUri,
      verification_uri_complete: authorization.verificationUriComplete,
      user_code: authorization.userCode,
      expires_in: Math.max(0, Math.round((authorization.expiresAt - Date.now()) / 1000)),
      // The step after the user approves, spelled out: no other CLI logs in
      // over two runs, so agents won't expect it. Left out when another
      // command started the login: running that command again is the step,
      // and its arguments aren't known here.
      next: this.#inline
        ? undefined
        : [{
            command: 'npx checkly login'
              + (this.#requestedAccountId ? ` --account-id ${shellQuote(this.#requestedAccountId)}` : ''),
            when: 'after the user has approved in the browser',
          }],
    }, [
      `Visit ${chalk.bold.underline(withoutScheme(authorization.verificationUri))} and enter `
      + chalk.bold(authorization.userCode),
      // Keeps its scheme: this is the link to click or copy.
      ...browserOpened ? [] : [chalk.dim(`Or open ${authorization.verificationUriComplete}`)],
      '',
    ])
  }

  /**
   * Authorization-code flow with a callback server on localhost. Used while
   * the device grant is not enabled for the CLI client. Only works when the
   * browser runs on the same machine as the CLI.
   */
  async #authenticateWithBrowserCallback (): Promise<Credentials | 'pending'> {
    // This login only completes while the command waits for the browser on
    // this machine. A command an agent started for something else (often
    // just a `whoami` check) would sit there unseen, since agents usually
    // show output only once a command exits; send the agent to the login
    // command instead.
    if (this.#mode === 'agent' && this.#inline) {
      this.#announce({
        status: 'action_required',
        reason: 'login_required',
        userActionRequired: true,
        message: 'Run `npx checkly login` in the background to log in (it waits for the browser on this machine '
          + 'to finish), relay what it prints, then run the original command again.',
        next: [{ command: 'npx checkly login' }],
      }, [])
      return 'pending'
    }

    const mode: AuthMode = this.#mode === 'interactive'
      ? await this.#promptForLoginOrSignUp()
      : 'any'
    const authContext = new AuthContext(mode)

    if (this.#mode === 'interactive') {
      // --no-browser / CHECKLY_NO_BROWSER: don't offer to open one.
      const openUrl = this.#openBrowser && (await prompts({
        name: 'openUrl',
        type: 'confirm',
        message: `Do you want to open a browser window to continue with ${mode === 'signup' ? 'sign up' : 'login'}?`,
        initial: true,
      })).openUrl

      if (openUrl) {
        await open(authContext.authenticationUrl)
      } else {
        // The login completes through a callback to localhost, so a browser
        // elsewhere (e.g. on the laptop an SSH session comes from) won't do.
        this.#print('Please open the following URL in a browser on this machine: '
          + `\n\n${chalk.cyan(authContext.authenticationUrl)}`)
      }
    } else {
      this.#announce({
        status: 'action_required',
        reason: 'login_required',
        userActionRequired: true,
        message: 'Ask the user to open the URL in a browser on the same machine as this CLI '
          + `(it completes through a local callback). ${Login.#signUpHint}`,
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

  /**
   * Opens the URL in a browser as a best effort. Returns whether one can be
   * assumed to have opened on the user's screen: `open` resolves as soon as
   * it starts a launcher, also in a remote session or on a Linux machine
   * without a desktop, where nothing appears.
   */
  async #tryOpenBrowser (url: string): Promise<boolean> {
    if (!this.#openBrowser) {
      return false
    }
    try {
      await open(url)
    } catch {
      return false
    }
    const remote = Boolean(process.env.SSH_CONNECTION || process.env.SSH_TTY)
    const noDesktop = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY
    return !remote && !noDesktop
  }

  /**
   * Runs `wait` behind the CLI's usual spinner when a person watches the
   * command's own output on a terminal; otherwise prints `message` as a plain
   * line, so piped output gets no animation frames and a login another
   * command started keeps its output on stderr (the spinner writes to
   * stdout). `report` shows a note while waiting.
   */
  async #whileWaiting<T> (message: string, wait: (report: (note: string) => void) => Promise<T>): Promise<T> {
    if (this.#mode !== 'interactive' || this.#inline || !this.fancy || !process.stdout.isTTY) {
      if (this.#mode === 'interactive') {
        this.#print(chalk.dim(`${message}…`))
      }
      return wait(note => this.#print(note))
    }
    this.style.actionStart(message)
    try {
      const result = await wait(note => this.style.actionStatus(note))
      this.style.actionSuccess()
      // actionSuccess ends with an empty line.
      this.#atBlankLine = true
      return result
    } catch (error) {
      this.style.actionFailure()
      throw error
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
        throw new LoginError('account_not_found', `No account with id "${requestedId}" is available to this user. `
          + `Available: ${available}`
          + (usingStoredKey ? '. To log in as a different user, run `npx checkly logout` first.' : ''))
      }
      return match
    }

    if (accounts.length === 0) {
      throw new LoginError('no_accounts', 'This user has no Checkly accounts. '
        + 'To log in as a different user, run `npx checkly logout` first.')
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

    this.#atBlankLine = false
    const selected = await selectAccount(accounts, {
      onCancel: () => this.error('Command cancelled.\n'),
    })
    if (!selected) {
      throw new Error('You must select a valid Checkly account name.')
    }
    return selected
  }
}
