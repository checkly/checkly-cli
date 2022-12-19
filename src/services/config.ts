import Conf from 'conf'

const dataSchema = {
  _: { type: 'string' },
  accountId: { type: 'string' },
  accountName: { type: 'string' },
}

const authSchema = {
  _: { type: 'string' },
  apiKey: { type: 'string' },
}

const projectSuffix = process.env.NODE_ENV === 'test' ? 'test' : ''

enum Env {
  production = 'production',
  staging = 'staging',
  development = 'development',
  test = 'test',
}

// There are some TS errors caused by ajv. We can keep this file as JS for the time being
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

  validateAuth () {
    const [, , command] = process.argv
    const publicCommands = [
      'conf',
      'login',
      'help',
      'version',
      'logout',
      '--help',
      '--version',
      '--exit',
    ]

    if (!this.hasValidSession() && !publicCommands.includes(command)) {
      console.error('Invalid Session')
      console.info(
        'Run `checkly login` or manually set `CHECKLY_API_KEY` & `CHECKLY_ACCOUNT_ID` environment variables to setup authentication.',
      )
      process.exit(1)
    }
  },

  init () {
    this.validateAuth()
    this.data.set('_', 'This is your Checkly config file.')
    this.auth.set('_', 'This is your Checkly auth file.')
  },
}

config.init()
export default config
