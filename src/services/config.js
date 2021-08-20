const Conf = require('conf')
const consola = require('consola')
const config = new Conf()

config.getEnv = () => {
  return process.env.NODE_ENV || config.get('env')
}

config.getApiKey = () => {
  return process.env.CHECKLY_API_KEY || config.get('apiKey')
}

if (!config.getApiKey() && !process.argv.includes('login')) {
  consola.error('CHECKLY_API_KEY` is missing')
  consola.info(
    'Run `checkly login` or set the CHECKLY_API_KEY environment variable to setup authentication.'
  )
  process.exit(1)
}

module.exports = config
