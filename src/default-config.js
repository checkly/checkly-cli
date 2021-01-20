'use strict'

const { version } = require('../package.json')

module.exports = {
  version,
  env: 'prod',
  output: 'text',

  prod: {
    apiUrl: 'https://api.checklyhq.com/v1'
  },

  staging: {
    apiUrl: 'https://api.checklyhq.com/v1'
  },

  local: {
    apiUrl: 'https://api.checklyhq.com/v1'
  }
}
