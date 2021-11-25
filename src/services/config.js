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

  clear() {
    this.auth.clear()
    this.data.clear()
  },

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

  hasValidSession() {
    return this.getApiKey() && this.getAccountId()
  },

  validateAuth() {
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
      consola.error(`Invalid Session`)
      consola.info(
        `Run \`checkly login\` or manually set \`CHECKLY_API_KEY\` & \`CHECKLY_ACCOUNT_ID\` environment variables to setup authentication.`
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
