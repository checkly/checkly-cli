const Conf = require('conf')
const consola = require('consola')
const config = new Conf()

const publicCommands = ['conf', 'login', 'help']

config.getEnv = () => {
  return process.env.NODE_ENV || config.get('env')
}

config.getApiKey = () => {
  return process.env.CHECKLY_API_KEY || config.get('apiKey')
}

const [, , command] = process.argv

if (!config.getApiKey() && !publicCommands.includes(command)) {
  consola.error('Missing API KEY')
  consola.info(
    'Run `checkly login` or set the CHECKLY_API_KEY environment variable to setup authentication.'
  )
  process.exit(1)
}

if (process.env.NODE_ENV === 'test') {
  config.set({
    env: 'development',
    version: '0.0.1',
    output: 'json',
    production: {
      apiUrl: 'https://api.checklyhq.com',
      apiVersion: 'v1',
    },
    development: {
      apiUrl: 'http://localhost:3000',
      apiVersion: 'v1',
    },
    staging: {
      apiUrl: 'https://api.checklyhq.com',
      apiVersion: 'v1',
    },
    isInitialized: 'true',
    accountId: 'e46106d8-e382-4d1f-8182-9d63983ed6d4',
    apiKey: '64d0f1bc42994be99089a2a939137a85',
    accountName: 'Jest Test',
  })
}

module.exports = config
