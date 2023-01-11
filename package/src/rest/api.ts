import axios, { AxiosInstance } from 'axios'
import config from '../services/config'
import Accounts from './accounts'
import Projects from './projects'
import Checks from './checks'
import Sockets from './sockets'
import Assets from './assets'
import Runtimes from './runtimes'
import PrivateLocations from './private-locations'

export function getDefaults () {
  const environments = {
    production: {
      apiUrl: 'https://api.checklyhq.com',
    },

    development: {
      apiUrl: 'http://localhost:3000',
    },

    test: {
      apiUrl: 'https://api-test.checklyhq.com',
    },

    staging: {
      apiUrl: 'https://api-test.checklyhq.com',
    },
  }

  const env = config.getEnv()
  const apiKey = config.getApiKey()
  const accountId = config.getAccountId()
  const baseURL = environments[env].apiUrl
  const Authorization = `Bearer ${apiKey}`

  return { baseURL, accountId, Authorization }
}

function init (): AxiosInstance {
  const { baseURL } = getDefaults()
  const api = axios.create({ baseURL })

  api.interceptors.request.use(function (config) {
    const { Authorization, accountId } = getDefaults()
    if (Authorization && config.headers) {
      config.headers.Authorization = Authorization
    }

    if (accountId && config.headers) {
      config.headers['x-checkly-account'] = accountId
    }

    return config
  })

  return api
}
const api = init()

export const accounts = new Accounts(api)
export const projects = new Projects(api)
export const checks = new Checks(api)
export const sockets = new Sockets(api)
export const assets = new Assets(api)
export const runtimes = new Runtimes(api)
export const privateLocations = new PrivateLocations(api)
