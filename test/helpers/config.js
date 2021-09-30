const Conf = require('conf')

const testConfig = () => {
  return {
    dataTest: new Conf({
      configName: 'data-test',
      defaults: {
        env: 'test',
        version: '0.0.1',
        output: 'json',
        production: {
          apiUrl: 'https://api.checklyhq.com',
          apiVersion: 'v1',
        },
        development: {
          apiUrl: 'http://localhost:3000',
          apiVersion: 'v1',
        },
        test: {
          apiUrl: 'http://localhost:3000',
          apiVersion: 'v1',
        },
        staging: {
          apiUrl: 'https://api.checklyhq.com',
          apiVersion: 'v1',
        },
        isInitialized: 'true',
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
