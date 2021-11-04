const ora = require('ora')
const axios = require('axios')
const consola = require('consola')

const sdk = require('../../sdk')
const config = require('./config')

const spinner = ora({
  // text: 'Fetching Checkly API',
  discardStdin: false,
  spinner: 'moon',
  color: 'cyan',
})

function getDefatuls() {
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
      apiUrl: 'http://localhost:3000',
      apiVersion: 'v1',
    },

    staging: {
      apiUrl: 'https://api.checklyhq.com',
      apiVersion: 'v1',
    },
  }

  const env = config.getEnv()
  const apiKey = config.getApiKey()
  const accountId = config.data.get('accountId')
  const baseHost = environments[env].apiUrl
  const basePath = environments[env].apiVersion
  const Authorization = `Bearer ${apiKey}`

  return { baseHost, basePath, accountId, Authorization }
}

function refresh() {
  const { baseHost, Authorization } = getDefatuls()
  api.defaults.headers.Authorization = Authorization
  api.defaults.baseURL = `${baseHost}`
}

const { baseHost, basePath, Authorization, accountId } = getDefatuls()

const api = axios.create({
  baseURL: `${baseHost}`,
  headers: { Authorization, 'x-checkly-account': accountId },
})

api.interceptors.request.use(function (config) {
  process.stdout.write('\n')
  config.spiner && spinner.start()
  return config
})

api.interceptors.response.use(
  (res) => {
    config.spiner && spinner.stop()
    return res
  },
  (error) => {
    config.spiner && spinner.stop()
    consola.error(error)
    return Promise.reject(error)
  }
)

module.exports = {
  refresh,
  getDefatuls,
  ...sdk.init({ api, baseHost, basePath }),
}
