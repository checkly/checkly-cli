import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { name as CIname } from 'ci-info'
import config from '../services/config.js'
import { assignProxy } from '../services/proxy.js'
import Accounts, { Account } from './accounts.js'
import Users from './users.js'
import Projects from './projects.js'
import Assets from './assets.js'
import AssetManifests from './asset-manifests.js'
import Runtimes from './runtimes.js'
import PrivateLocations from './private-locations.js'
import Locations from './locations.js'
import TestSessions from './test-sessions.js'
import EnvironmentVariables from './environment-variables.js'
import HeartbeatChecks from './heartbeat-checks.js'
import ChecklyStorage from './checkly-storage.js'
import Checks from './checks.js'
import CheckStatuses from './check-statuses.js'
import CheckResults from './check-results.js'
import CheckGroups from './check-groups.js'
import ErrorGroups from './error-groups.js'
import TestSessionErrorGroups from './test-session-error-groups.js'
import StatusPages from './status-pages.js'
import Incidents from './incidents.js'
import Analytics from './analytics.js'
import BatchAnalytics from './batch-analytics.js'
import Entitlements from './entitlements.js'
import AccountMembers from './account-members.js'
import AlertChannels from './alert-channels.js'
import AlertNotifications from './alert-notifications.js'
import Rca from './rca.js'
import Cancel from './cancel.js'
import Resources from './resources.js'
import { handleErrorResponse, UnauthorizedError } from './errors.js'
import { detectOperator } from '../helpers/cli-mode.js'

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
    throw new Error('Run `npx checkly login` or set `CHECKLY_API_KEY` '
      + '& `CHECKLY_ACCOUNT_ID` in your environment or .env file.')
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
        + `and API key "...${apiKey?.slice(-4)}"`, { cause: err })
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

  config.headers['x-checkly-source'] = 'CLI'
  config.headers['x-checkly-ci-name'] = CIname
  config.headers['x-checkly-operator'] = detectOperator()

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
export const assetManifests = new AssetManifests(api)
export const runtimes = new Runtimes(api)
export const locations = new Locations(api)
export const privateLocations = new PrivateLocations(api)
export const testSessions = new TestSessions(api)
export const environmentVariables = new EnvironmentVariables(api)
export const heartbeatCheck = new HeartbeatChecks(api)
export const checklyStorage = new ChecklyStorage(api)
export const checks = new Checks(api)
export const checkStatuses = new CheckStatuses(api)
export const checkResults = new CheckResults(api)
export const checkGroups = new CheckGroups(api)
export const errorGroups = new ErrorGroups(api)
export const testSessionErrorGroups = new TestSessionErrorGroups(api)
export const statusPages = new StatusPages(api)
export const incidents = new Incidents(api)
export const analytics = new Analytics(api)
export const batchAnalytics = new BatchAnalytics(api)
export const entitlements = new Entitlements(api)
export const accountMembers = new AccountMembers(api)
export const alertChannels = new AlertChannels(api)
export const alertNotifications = new AlertNotifications(api)
export const rca = new Rca(api)
export const cancel = new Cancel(api)
export const resources = new Resources(api)
