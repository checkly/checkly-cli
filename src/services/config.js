const Conf = require('conf')
const config = new Conf()

config.set('apiKey', process.env.CHECKLY_API_KEY || Conf.apiKey)

module.exports = new Conf()
