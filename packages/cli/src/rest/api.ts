import axios, { AxiosInstance, CreateAxiosDefaults } from 'axios'
// @ts-ignore
import { getProxyForUrl } from 'proxy-from-env'
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent'
import config from '../services/config'
import Accounts from './accounts'
import Users from './users'
import Projects from './projects'
import Assets from './assets'
import Runtimes from './runtimes'
import PrivateLocations from './private-locations'
import Locations from './locations'
import TestSessions from './test-sessions'
import EnvironmentVariables from './environment-variables'

export function getDefaults () {
  const apiKey = config.getApiKey()
  const accountId = config.getAccountId()
  const baseURL = config.getApiUrl()
  const Authorization = `Bearer ${apiKey}`

  return { baseURL, accountId, Authorization, apiKey }
}

export async function validateAuthentication (): Promise<void> {
  if (!config.hasValidCredentials()) {
    throw new Error('Run `npx checkly login` or manually set `CHECKLY_API_KEY` ' +
      '& `CHECKLY_ACCOUNT_ID` environment variables to setup authentication.')
  }

  const accountId = config.getAccountId()
  const apiKey = config.getApiKey()

  try {
    // check if credentials works
    await accounts.get(accountId)
  } catch (err: any) {
    if (err.response?.status === 401) {
      throw new Error(`Authentication failed with account id "${accountId}" ` +
        `and API key "...${apiKey?.slice(-4)}"`)
    } else if (!err.response) {
      // The request was made but no response was received. This may be due to an internet connection issue.
      throw new Error(`Encountered an error connecting to Checkly. Please check that the internet connection is working. ${err.message}`)
    } else {
      throw new Error(`Encountered an unexpected error connecting to Checkly: ${err.message}`)
    }
  }
}

const isHttps = (protocol: string) => protocol.startsWith('https')

function assignProxy (baseURL: string, axiosConfig: CreateAxiosDefaults) {
  const proxy = getProxyForUrl(baseURL)

  if (!proxy) {
    return axiosConfig
  }

  const isEndpointHttps = isHttps(baseURL)

  if (isEndpointHttps) {
    axiosConfig.httpsAgent = new HttpsProxyAgent({ proxy })
  } else {
    axiosConfig.httpAgent = new HttpProxyAgent({ proxy })
  }

  return axiosConfig
}

function init (): AxiosInstance {
  const { baseURL } = getDefaults()
  const axiosConf = assignProxy(baseURL, { baseURL })

  const api = axios.create(axiosConf)

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
export const api = init()

export const accounts = new Accounts(api)
export const user = new Users(api)
export const projects = new Projects(api)
export const assets = new Assets(api)
export const runtimes = new Runtimes(api)
export const locations = new Locations(api)
export const privateLocations = new PrivateLocations(api)
export const testSessions = new TestSessions(api)
export const environmentVariables = new EnvironmentVariables(api)
