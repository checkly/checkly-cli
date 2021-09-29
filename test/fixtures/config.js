const defaultConfig = {
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
  accountName: 'Test',
}

module.exports = {
  defaultConfig,
}
