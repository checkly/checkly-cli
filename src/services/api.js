const axios = require('axios')

const { api } = require('../../sdk')
const config = require('./config')

function getDefaults () {
  const environments = {
    production: {
      apiUrl: 'https://api.checklyhq.com',
      apiVersion: 'v1',
    },

    development: {
      apiUrl: 'http://localhost:3000',
      apiVersion: 'v1',
    },

    test: {
      apiUrl: 'https://api.checklyhq.com',
      apiVersion: 'v1',
    },

    staging: {
      apiUrl: 'https://api.checklyhq.com',
      apiVersion: 'v1',
    },
  }

  const env = config.getEnv()
  const apiKey = config.getApiKey()
  const accountId = config.getAccountId()
  const basePath = environments[env].apiVersion
  const baseURL = environments[env].apiUrl
  const Authorization = `Bearer ${apiKey}`

  return { baseURL, basePath, accountId, Authorization }
}

function init () {
  const { baseURL } = getDefaults()
  const api = axios.create({ baseURL })

  api.interceptors.request.use(function (config) {
    const { Authorization, accountId } = getDefaults()

    Authorization && (config.headers.Authorization = Authorization)
    accountId && (config.headers['x-checkly-account'] = accountId)

    return config
  })

  return api
}

module.exports = {
  getDefaults,
  ...api.init({ api: init() }),
}
