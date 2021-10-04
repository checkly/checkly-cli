const Conf = require('conf')

const testConfig = () => {
  return {
    dataTest: new Conf({
      configName: 'data-test',
      defaults: {
        output: 'json',
        accountName: 'Test Account',
        accountId: 'abc123',
      },
    }),
    authTest: new Conf({
      configName: 'auth-test',
      defaults: {
        apiKey: '123abc',
      },
    }),
  }
}

module.exports = testConfig
