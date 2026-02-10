import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { name as CIname } from 'ci-info'
import config from '../services/config'
import { assignProxy } from '../services/proxy'
import Accounts, { Account } from './accounts'
import Users from './users'
import Projects from './projects'
import Assets from './assets'
import Runtimes from './runtimes'
import PrivateLocations from './private-locations'
import Locations from './locations'
import TestSessions from './test-sessions'
import EnvironmentVariables from './environment-variables'
import HeartbeatChecks from './heartbeat-checks'
import Checks from './checks'
import ChecklyStorage from './checkly-storage'
import { handleErrorResponse, UnauthorizedError } from './errors'

/**
 * The API version date for the new versioned API surface (/api/).
 * This is pinned per CLI release — clients opt in to new versions explicitly.
 */
export const CHECKLY_API_VERSION = '2026-02-10'

export function getDefaults () {
  const apiKey = config.getApiKey()
  const accountId = config.getAccountId()
  const baseURL = config.getApiUrl()
  const Authorization = `Bearer ${apiKey}`

  return { baseURL, accountId, Authorization, apiKey }
}

export async function validateAuthentication (): Promise<Account | undefined> {
  // This internal environment variable allows auth checks to be skipped
  // when using e.g. debug flags that don't actually need to authenticate
  // with the Checkly API.
  if (process.env.CHECKLY_SKIP_AUTH === '1') {
    return
  }

  if (!config.hasValidCredentials()) {
    throw new Error('Run `npx checkly login` or manually set `CHECKLY_API_KEY` '
      + '& `CHECKLY_ACCOUNT_ID` environment variables to setup authentication.')
  }

  const accountId = config.getAccountId()
  const apiKey = config.getApiKey()

  try {
    // check if credentials works
    const resp = await accounts.get(accountId)
    return resp.data
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      throw new Error(`Authentication failed with account id "${accountId}" `
        + `and API key "...${apiKey?.slice(-4)}"`)
    }

    throw err
  }
}

export function requestInterceptor (config: InternalAxiosRequestConfig) {
  const { Authorization, accountId } = getDefaults()
  if (Authorization && config.headers) {
    config.headers.Authorization = Authorization
  }

  if (accountId && config.headers) {
    config.headers['x-checkly-account'] = accountId
  }

  config.headers['x-checkly-ci-name'] = CIname

  // Pin API version header for all /api/ requests
  if (config.url?.startsWith('/api/')) {
    config.headers['x-checkly-api-version'] = CHECKLY_API_VERSION
  }

  return config
}

export function responseErrorInterceptor (error: any) {
  handleErrorResponse(error)
}

function init (): AxiosInstance {
  const { baseURL } = getDefaults()
  const axiosConf = assignProxy(baseURL, { baseURL })

  const api = axios.create(axiosConf)

  api.interceptors.request.use(requestInterceptor)

  api.interceptors.response.use(
    response => response,
    responseErrorInterceptor,
  )

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
export const heartbeatCheck = new HeartbeatChecks(api)
export const checks = new Checks(api)
export const checklyStorage = new ChecklyStorage(api)
