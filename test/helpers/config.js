const Conf = require('conf')

const testConfig = () => {
  return {
    dataTest: new Conf({
      configName: 'data-test',
      projectSuffix: '',
      defaults: {
        output: 'json',
        accountName: 'Test Account',
        accountId: 'abc123',
      },
    }),
    authTest: new Conf({
      configName: 'auth-test',
      projectSuffix: '',
      defaults: {
        apiKey: '123abc',
      },
    }),
  }
}

module.exports = testConfig
