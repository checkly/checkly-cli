const Conf = require('conf')

const getConfig = async (name) => {
  const config = new Conf({
    projectName: 'jest-test-1',
    defaults: {
      env: 'development',
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
      staging: {
        apiUrl: 'https://api.checklyhq.com',
        apiVersion: 'v1',
      },
      isInitialized: 'true',
      accountId: 'abc123',
      apiKey: '123abc',
      accountName: 'Jest Test',
    },
  })
  return config
}

module.exports = getConfig
