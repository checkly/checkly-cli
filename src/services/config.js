const Conf = require('conf')
const consola = require('consola')
const config = new Conf()

const key = process.env.CHECKLY_API_KEY || config.apiKey
const env = process.env.CHECKLY_ENV

if (!key) {
  consola.error(
    '`CHECKLY_API_KEY` is required, please run `checkly init` to initialise project.'
  )
  process.exit(1)
}

config.set('apiKey', key)

if (env) {
  config.set('env', env)
}

module.exports = config
