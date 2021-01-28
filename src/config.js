const Conf = require('conf')
Conf.apiKey = process.env.CHECKLY_API_KEY || Conf.apiKey
module.exports = new Conf()
