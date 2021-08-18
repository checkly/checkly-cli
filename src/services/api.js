const axios = require('axios')
const consola = require('consola')
const { cli } = require('cli-ux')

const sdk = require('../../sdk')
const config = require('./config')

const env = process.env.NODE_ENV || config.get('env')
const apiKey = process.env.CHECKLY_API_KEY || config.get('apiKey')
const baseHost = config.get(`${env}.apiUrl`)
const basePath = config.get(`${env}.apiVersion`)
const Authorization = `Bearer ${apiKey}`

const api = axios.create({
  baseURL: `${baseHost}${basePath}`,
  headers: { Authorization },
})

api.interceptors.request.use(function (config) {
  cli.action.start('Fetching API')
  return config
})

api.interceptors.response.use(
  (res) => {
    cli.action.stop('\n')
    return res
  },
  (error) => {
    consola.error(error)
    return Promise.reject(error)
  }
)

module.exports = sdk.init({
  api,
  apiKey,
})
