import Conf from 'conf'

const dataSchema = {
  accountId: { type: 'string' },
  accountName: { type: 'string' },
}

const authSchema = {
  apiKey: { type: 'string' },
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
  private _auth?: Conf<{ apiKey: unknown }>
  private _data?: Conf<{ accountId: unknown, accountName: unknown }>

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
    const env = process.env.CHECKLY_ENV as string || environments[0] as string

    if (!(env in Env)) {
      throw new Error('Invalid CHECKLY_ENV')
    }

    return env as Env
  }

  getApiKey (): string {
    return process.env.CHECKLY_API_KEY || this.auth.get<string>('apiKey') as string || ''
  }

  getAccountId (): string {
    return process.env.CHECKLY_ACCOUNT_ID || this.data.get<string>('accountId') as string || ''
  }

  hasEnvVarsConfigured (): boolean {
    const apiKey = process.env.CHECKLY_API_KEY || ''
    const accoundId = process.env.CHECKLY_ACCOUNT_ID || ''
    return apiKey !== '' || accoundId !== ''
  }

  getApiUrl (): string {
    const environments = {
      local: 'http://127.0.0.1:3000',
      development: 'https://api-dev.checklyhq.com',
      staging: 'https://api-test.checklyhq.com',
      production: 'https://api.checklyhq.com',
    }
    return environments[this.getEnv()]!
  }

  getMqttUrl (): string {
    const environments = {
      local: 'wss://events-local.checklyhq.com',
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
