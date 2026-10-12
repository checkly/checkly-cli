import { ConfigStore, type ConfigStoreSchema } from './config-store.js'

type DataStore = { accountId: unknown, accountName: unknown }
type AuthStore = { apiKey: unknown, pendingDeviceAuthorization: unknown }

const dataSchema: ConfigStoreSchema<DataStore> = {
  accountId: { type: 'string' },
  accountName: { type: 'string' },
}

const authSchema: ConfigStoreSchema<AuthStore> = {
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

class ChecklyConfig {
  private _auth?: ConfigStore<AuthStore>
  private _data?: ConfigStore<DataStore>

  // Writing to auth or data creates the config file. Avoid writing unless
  // necessary, since this operation can fail due to file permissions.
  get auth () {
    // Create this._auth lazily
    return this._auth ?? (this._auth = new ConfigStore({
      projectName: '@checkly/cli',
      configName: 'auth',
      projectSuffix,
      schema: authSchema,
    }))
  }

  get data () {
    // Create this._data lazily
    return this._data ?? (this._data = new ConfigStore({
      projectName: '@checkly/cli',
      configName: 'config',
      projectSuffix,
      schema: dataSchema,
    }))
  }

  clear () {
    this.auth.clear()
    this.data.clear()
  }

  getEnv (): Env {
    const environments = ['production', 'development', 'staging', 'local']
    const env = process.env.CHECKLY_ENV as string || environments[0] as string

    if (!(env in Env)) {
      throw new Error('Invalid CHECKLY_ENV')
    }

    return env as Env
  }

  getApiKey (): string {
    return process.env.CHECKLY_API_KEY || this.auth.get('apiKey') as string || ''
  }

  getAccountId (): string {
    return process.env.CHECKLY_ACCOUNT_ID || this.data.get('accountId') as string || ''
  }

  hasEnvVarsConfigured (): boolean {
    const apiKey = process.env.CHECKLY_API_KEY || ''
    const accoundId = process.env.CHECKLY_ACCOUNT_ID || ''
    return apiKey !== '' || accoundId !== ''
  }

  getApiUrl (): string {
    const environments = {
      local: process.env.CHECKLY_API_URL || 'http://127.0.0.1:3000',
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
    const environments = {
      // Overridable for local development setups whose event stream is served
      // from a different broker, mirroring how CHECKLY_API_URL overrides the API.
      local: process.env.CHECKLY_MQTT_URL || 'wss://events-local.checklyhq.com',
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
