const { version } = require('../../package.json')

module.exports = {
  version,
  env: 'production',
  output: 'human',

  production: {
    apiUrl: 'https://api.checklyhq.com/',
    apiVersion: 'v1',
  },

  development: {
    apiUrl: 'http://localhost:3000/',
    apiVersion: 'v1',
  },

  staging: {
    apiUrl: 'https://api.checklyhq.com/',
    apiVersion: 'v1',
  },
}
