const Conf = require('conf')
const consola = require('consola')
const config = new Conf()

const key = process.env.CHECKLY_API_KEY || config.get('apiKey')
const env = process.env.NODE_ENV || config.get('env')

if (!key && !process.argv.includes('login')) {
  consola.error(
    '`CHECKLY_API_KEY` is required, please run `checkly login` or set the CHECKLY_API_KEY environment variable to setup authentication.'
  )
  process.exit(1)
}

if (env) {
  config.set('env', env)
}

module.exports = config
