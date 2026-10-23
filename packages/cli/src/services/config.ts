import Conf from 'conf'

const dataSchema = {
  accountId: { type: 'string' },
  accountName: { type: 'string' },
}

const authSchema = {
  apiKey: { type: 'string' },
  // A device code an agent-mode login handed to the user and has not
  // collected yet; see `checkly login`.
  pendingDeviceAuthorization: { type: 'object' },
}

const projectSuffix = process.env.CHECKLY_ENV ?? ''

// eslint-disable-next-line no-restricted-syntax
enum Env {
  production = 'production',
  staging = 'staging',
  development = 'development',
  local = 'local',
}

export type CredentialSource = 'login' | 'account_override' | 'environment'

// What `pinEnvironment()` freezes: the credentials and the endpoints they are sent to.
const PINNED_VARIABLES = [
  'CHECKLY_API_KEY', 'CHECKLY_ACCOUNT_ID', 'CHECKLY_ENV', 'CHECKLY_API_URL', 'CHECKLY_MQTT_URL',
] as const
type PinnedVariable = typeof PINNED_VARIABLES[number]
type PinnedEnv = Record<PinnedVariable, string | undefined>

class ChecklyConfig {
  private _auth?: Conf<{ apiKey: unknown, pendingDeviceAuthorization: unknown }>
  private _data?: Conf<{ accountId: unknown, accountName: unknown }>
  private pinnedEnv?: PinnedEnv
  private warnedEnv = new Set<PinnedVariable>()

  // Accessing auth or data will cause a config file to be created.
  // We should avoid doing this unless absolutely necessary, since this operation can fail due to file permissions.
  get auth () {
    // Create this._auth lazily
    return this._auth ?? (this._auth = new Conf({
      projectName: '@checkly/cli',
      configName: 'auth',
      projectSuffix,
      // @ts-ignore
      schema: authSchema,
    }))
  }

  get data () {
    // Create this._data lazily
    return this._data ?? (this._data = new Conf({
      projectName: '@checkly/cli',
      configName: 'config',
      projectSuffix,
      // @ts-ignore
      schema: dataSchema,
    }))
  }

  clear () {
    this.auth.clear()
    this.data.clear()
  }

  getEnv (): Env {
    const environments = ['production', 'development', 'staging', 'local']
    const env = this.env('CHECKLY_ENV') || environments[0] as string

    if (!(env in Env)) {
      throw new Error('Invalid CHECKLY_ENV')
    }

    return env as Env
  }

  /**
   * Freezes the variables that decide which credentials the CLI sends and
   * where it sends them, at their current values for the rest of the run.
   * Commands call this once authentication has passed, before they load user
   * code: check files and Playwright configs run in the CLI's process, and one
   * that loads another .env file (e.g. `dotenv.config({ override: true })`)
   * would otherwise switch the key or account of every later request, or send
   * the authenticated key to another host. A variable unset at this point
   * stays unset. Stored credentials are unaffected; only the CLI changes them.
   */
  pinEnvironment (): void {
    this.pinnedEnv = Object.fromEntries(PINNED_VARIABLES.map(name => [name, process.env[name]])) as PinnedEnv
    this.warnedEnv.clear()
  }

  /** A pinned variable's value: the value at pinning once pinned, warning once if it has changed since. */
  private env (name: PinnedVariable): string | undefined {
    if (this.pinnedEnv === undefined) {
      return process.env[name]
    }
    const pinned = this.pinnedEnv[name]
    if ((process.env[name] || undefined) !== (pinned || undefined) && !this.warnedEnv.has(name)) {
      this.warnedEnv.add(name)
      // Never the key itself, and not a URL either: it may carry credentials.
      const account = name === 'CHECKLY_ACCOUNT_ID' && (pinned || this.getStoredAccountId())
      const kept = name === 'CHECKLY_API_KEY'
        ? 'the API key it authenticated with'
        : account ? `account "${account}"` : 'the value it authenticated with'
      process.stderr.write(`Warning: \`${name}\` changed after the CLI authenticated (for example, a config file `
        + `loaded another .env file). The CLI keeps using ${kept} for this run. To use another value, set it `
        + 'before the CLI starts: on the command line, in your shell, or in the .env file of the directory you run '
        + 'the CLI from (a value set in the shell takes precedence over .env).\n')
    }
    return pinned
  }

  getApiKey (): string {
    return this.env('CHECKLY_API_KEY') || this.auth.get<string>('apiKey') as string || ''
  }

  getAccountId (): string {
    return this.env('CHECKLY_ACCOUNT_ID') || this.getStoredAccountId()
  }

  /** The account `checkly login` stored as the default, ignoring the environment. */
  getStoredAccountId (): string {
    return this.data.get<string>('accountId') as string || ''
  }

  /** The stored default account with its name (the id when the name is missing), if there is one. */
  getStoredAccount (): { id: string, name: string } | undefined {
    const id = this.getStoredAccountId()
    return id ? { id, name: this.data.get<string>('accountName') as string || id } : undefined
  }

  /** Whether `checkly login` stored both a key and a default account. */
  hasStoredLogin (): boolean {
    return Boolean(this.auth.get<string>('apiKey')) && this.getStoredAccountId() !== ''
  }

  /**
   * Where this run's credentials come from:
   * - `environment`: `CHECKLY_API_KEY` is set. Such a key belongs to one
   *   account; `CHECKLY_ACCOUNT_ID` names it, and `checkly login` stays out
   *   of the way.
   * - `account_override`: only `CHECKLY_ACCOUNT_ID` is set. It picks the
   *   account for the key `checkly login` stores, which belongs to the user
   *   and works with all of their accounts. The CLI cannot tell a one-command
   *   prefix from an export or a `.env` entry, so this holds for every command
   *   while the variable is set.
   * - `login`: neither is set; the stored key and default account apply.
   */
  getCredentialSource (): CredentialSource {
    if (this.env('CHECKLY_API_KEY')) {
      return 'environment'
    }
    return this.env('CHECKLY_ACCOUNT_ID') ? 'account_override' : 'login'
  }

  getApiUrl (): string {
    // Allow overriding the API URL via CHECKLY_BASE_URL environment variable
    if (process.env.CHECKLY_BASE_URL) {
      return process.env.CHECKLY_BASE_URL
    }

    const environments = {
      local: this.env('CHECKLY_API_URL') || 'http://127.0.0.1:3000',
      development: 'https://api-dev.checklyhq.com',
      staging: 'https://api-test.checklyhq.com',
      production: 'https://api.checklyhq.com',
    }
    return environments[this.getEnv()]!
  }

  getAuthUrl (): string {
    const environments = {
      // Overridable for local development and tests that stand in for Auth0,
      // mirroring how CHECKLY_API_URL overrides the API.
      local: process.env.CHECKLY_AUTH_URL || 'https://auth.checklyhq.com',
      development: 'https://auth.checklyhq.com',
      staging: 'https://auth.checklyhq.com',
      production: 'https://auth.checklyhq.com',
    }
    return environments[this.getEnv()]!
  }

  getMqttUrl (): string {
    if (process.env.CHECKLY_MQTT_URL) {
      return process.env.CHECKLY_MQTT_URL
    }

    const environments = {
      // Overridable for local development setups whose event stream is served
      // from a different broker, mirroring how CHECKLY_API_URL overrides the API.
      local: this.env('CHECKLY_MQTT_URL') || 'wss://events-local.checklyhq.com',
      development: 'wss://events-dev.checklyhq.com',
      staging: 'wss://events-test.checklyhq.com',
      production: 'wss://events.checklyhq.com',
    }
    return environments[this.getEnv()]!
  }

  hasValidCredentials (): boolean {
    if (this.getApiKey() !== '' && this.getAccountId() !== '') {
      return true
    }
    return false
  }
}

const config = new ChecklyConfig()
export default config
