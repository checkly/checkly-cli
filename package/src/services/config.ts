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
      console.error('Invalid NODE_ENV')
      process.exit(1)
    }

    return env as Env
  },

  getApiKey (): string|null|undefined {
    return process.env.CHECKLY_API_KEY || this.auth.get<string>('apiKey') as string
  },

  getAccountId (): string|null|undefined {
    return process.env.CHECKLY_ACCOUNT_ID || this.data.get<string>('accountId') as string
  },

  hasValidSession () {
    return this.getApiKey() && this.getAccountId()
  },

  validateAuth (auth: boolean) {
    if (auth && !this.hasValidSession()) {
      console.error('Invalid Session')
      console.info(
        'Run `checkly login` or manually set `CHECKLY_API_KEY` & `CHECKLY_ACCOUNT_ID` environment variables to setup authentication.',
      )
      process.exit(1)
    }
  },
}

export default config
