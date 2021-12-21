const config = require('./../../src/services/config')

const testConfig = () => {
  config.auth.set('apiKey', '123abc')
  config.data.set('output', 'json')
  config.data.set('accountName', 'Test Account')
  config.data.set('accountId', 'abc123')
}

module.exports = testConfig
