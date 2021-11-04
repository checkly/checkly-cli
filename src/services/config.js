const Conf = require('conf')
const consola = require('consola')

const dataSchema = {
  _: { type: 'string' },
  output: { type: 'string', pattern: 'human|json|plain' },
  collectMetricts: { type: 'boolean' },
  accountId: { type: 'string' },
  accountName: { type: 'string' },
}

const authSchema = {
  _: { type: 'string' },
  apiKey: { type: 'string' },
}

const projectSuffix = process.env.NODE_ENV === 'test' ? 'test' : ''

const config = {
  auth: new Conf({ configName: 'auth', projectSuffix, schema: authSchema }),
  data: new Conf({
    configName: 'config',
    projectSuffix,
    schema: dataSchema,
  }),

  getEnv() {
    const environments = ['production', 'staging', 'development', 'test']
    const env = process.env.NODE_ENV || environments[0]

    if (!environments.includes(env)) {
      consola.error('Invalid NODE_ENV')
      process.exit(1)
    }

    return env
  },

  getApiKey() {
    return process.env.CHECKLY_API_KEY || this.auth.get('apiKey')
  },

  getAccountId() {
    return process.env.CHECKLY_ACCOUNT_ID || this.data.get('accountId')
  },

  validateAuth() {
    const [, , command] = process.argv
    const publicCommands = [
      'conf',
      'login',
      'help',
      'version',
      '--help',
      '--version',
    ]

    if (!this.getApiKey() && !publicCommands.includes(command)) {
      consola.error('Missing API KEY')
      consola.info(
        'Run `checkly login` or set the CHECKLY_API_KEY environment variable to setup authentication.'
      )
      process.exit(1)
    }
  },

  init() {
    this.validateAuth()
    this.data.set('_', 'This is your Checkly config file.')
    this.auth.set('_', 'This is your Checkly auth file.')
  },
}

config.init()

module.exports = config
