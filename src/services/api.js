const ora = require('ora')
const axios = require('axios')
const consola = require('consola')

const sdk = require('../../sdk')
const config = require('./config')

const spinner = ora({
  text: 'Fetching Checkly API',
  spinner: 'moon',
  color: 'cyan',
})

function getApiDefaults() {
  const environmments = {
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
  }

  const env = config.getEnv()
  const apiKey = config.getApiKey()
  const baseHost = `${environmments[env]}.apiUrl`
  const basePath = `${environmments[env]}.apiVersion`
  const Authorization = `Bearer ${apiKey}`

  return { baseHost, basePath, Authorization }
}

function refresh() {
  const { baseHost, Authorization } = getApiDefaults()
  api.defaults.headers.Authorization = Authorization
  api.defaults.baseURL = `${baseHost}`
}

const { baseHost, basePath, Authorization } = getApiDefaults()

const api = axios.create({
  baseURL: `${baseHost}`,
  headers: { Authorization },
})

api.interceptors.request.use(function (config) {
  process.stdout.write('\n')
  spinner.start()
  return config
})

api.interceptors.response.use(
  (res) => {
    spinner.stop()
    return res
  },
  (error) => {
    spinner.stop()
    consola.error(error)
    return Promise.reject(error)
  }
)

module.exports = { refresh, ...sdk.init({ api, baseHost, basePath }) }
