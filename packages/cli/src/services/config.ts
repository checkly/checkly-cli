import Conf from 'conf'

const dataSchema = {
  accountId: { type: 'string' },
  accountName: { type: 'string' },
}

const authSchema = {
  apiKey: { type: 'string' },
}

const projectSuffix = process.env.NODE_ENV === 'test' ? 'test' : ''

enum Env {
  production = 'production',
  staging = 'staging',
  development = 'development',
  test = 'test',
}

const config = {
  auth: new Conf({
    configName: 'auth',
    projectSuffix,
    // @ts-ignore
    schema: authSchema,
  }),
  data: new Conf({
    configName: 'config',
    projectSuffix,
    // @ts-ignore
    schema: dataSchema,
  }),

  clear () {
    this.auth.clear()
    this.data.clear()
  },

  getEnv (): Env {
    const environments = ['production', 'staging', 'development', 'test']
    const env = process.env.NODE_ENV as string || environments[0] as string

    if (!(env in Env)) {
      throw new Error('Invalid NODE_ENV')
    }

    return env as Env
  },

  getApiKey (): string {
    return process.env.CHECKLY_API_KEY || this.auth.get<string>('apiKey') as string || ''
  },

  getAccountId (): string {
    return process.env.CHECKLY_ACCOUNT_ID || this.data.get<string>('accountId') as string || ''
  },

  getMqttUrl (): string|null|undefined {
    const environments = {
      development: 'wss://events-local.checklyhq.com',
      test: 'wss://events-test.checklyhq.com',
      staging: 'wss://events-test.checklyhq.com',
      production: 'wss://events.checklyhq.com',
    }
    return environments[this.getEnv()]
  },

  hasValidCredentials (): boolean {
    if (this.getApiKey() !== '' && this.getAccountId() !== '') {
      return true
    }
    return false
  },
}

export default config
