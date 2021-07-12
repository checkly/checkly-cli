const Conf = require('conf')
const config = new Conf()

config.apiKey = process.env.CHECKLY_API_KEY || Conf.apiKey

module.exports = {
  config
}
