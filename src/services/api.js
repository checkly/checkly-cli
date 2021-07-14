const axios = require('axios')
const ora = require('ora')

const sdk = require('../../sdk')
const config = require('./config')

const env = process.env.NODE_ENV || config.get('env')
const apiKey = config.get('apiKey')
const baseHost = config.get(`${env}.apiUrl`)
const basePath = config.get(`${env}.apiVersion`)
const Authorization = `Bearer ${apiKey}`

let spinner = null

const api = axios.create({
  baseURL: `${baseHost}${basePath}`,
  headers: { Authorization },
})

api.interceptors.request.use(function (config) {
  spinner = ora().start()
  return config
})

api.interceptors.response.use(
  (res) => {
    spinner.stop()
    return res
  },
  (error) => {
    spinner.stop()
    return Promise.reject(error)
  }
)

module.exports = sdk.init({
  api,
  apiKey,
})
