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

module.exports = config
