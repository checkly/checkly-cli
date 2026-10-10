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
import CheckSessions from './check-sessions.js'
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
import Usage from './usage.js'
import { ForbiddenError, handleErrorResponse, NotFoundError, UnauthorizedError } from './errors.js'
import { createRetryInterceptor } from './retry.js'
import { detectOperator } from '../helpers/cli-mode.js'

export function getDefaults () {
  const apiKey = config.getApiKey()
  const accountId = config.getAccountId()
  const baseURL = config.getApiUrl()
  const Authorization = `Bearer ${apiKey}`

  return { baseURL, accountId, Authorization, apiKey }
}

/**
 * Checks the configured credentials against the configured account, or
 * against `accountId` when given (activating an account that is not the
 * configured one yet). Pass `suggestLogin: false` when trying out a
 * different account (switching), where logging in again would not help.
 */
export async function validateAuthentication (
  { suggestLogin = true, accountId = config.getAccountId() }: { suggestLogin?: boolean, accountId?: string } = {},
): Promise<Account | undefined> {
  // This internal environment variable allows auth checks to be skipped
  // when using e.g. debug flags that don't actually need to authenticate
  // with the Checkly API.
  if (process.env.CHECKLY_SKIP_AUTH === '1') {
    return
  }

  const source = config.getCredentialSource()
  const apiKey = config.getApiKey()

  if (apiKey === '' || accountId === '') {
    // API key credentials are a deliberate choice, so the missing half is
    // the actionable part, not a hint to log in.
    if (source === 'environment') {
      throw new Error('`CHECKLY_ACCOUNT_ID` is not set. Set both `CHECKLY_API_KEY` and `CHECKLY_ACCOUNT_ID` '
        + 'in your environment or .env file.')
    }
    // Only reached without a login to go with the account (CI, or a run
    // that cannot show a login code): name both ways to authenticate.
    if (source === 'account_override') {
      throw new Error('`CHECKLY_ACCOUNT_ID` is set, but there is no `checkly login` session to use it with. '
        + 'Run `npx checkly login`, or set `CHECKLY_API_KEY` as well to use API key credentials.')
    }
    throw new Error('Run `npx checkly login` or set `CHECKLY_API_KEY` '
      + '& `CHECKLY_ACCOUNT_ID` in your environment or .env file.')
  }

  try {
    // check if credentials works
    const resp = await accounts.get(accountId)
    return resp.data
  } catch (err: any) {
    // API key credentials have to be fixed where they are set; a login can
    // be renewed by logging in again.
    if (source === 'environment' || !suggestLogin) {
      if (err instanceof UnauthorizedError) {
        throw new Error(`Authentication failed with account id "${accountId}" `
          + `and API key "...${apiKey.slice(-4)}".`, { cause: err })
      }
      throw err
    }
    if (err instanceof UnauthorizedError) {
      throw new Error(`Authentication failed with account id "${accountId}" `
        + `and API key "...${apiKey.slice(-4)}". Run \`npx checkly login\` to log in again.`, { cause: err })
    }
    if (err instanceof ForbiddenError || err instanceof NotFoundError) {
      if (source === 'account_override') {
        // Most likely a typo or an account of someone else: list the ones
        // the login does work with, so the next step needs no lookup.
        const available = await accounts.getAll()
          .then(({ data }) => ` This login works with: ${data.map(({ id, name }) => `${name} (${id})`).join(', ')}.`)
          .catch(() => '')
        throw new Error(`Account "${accountId}" from \`CHECKLY_ACCOUNT_ID\` is not available with your login.`
          + `${available} Fix \`CHECKLY_ACCOUNT_ID\` where it is set (the command line, your shell or .env).`,
        { cause: err })
      }
      throw new Error(`Account "${accountId}" is not available with the stored login. `
        + 'Run `npx checkly login` to log in again.', { cause: err })
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

  // Must be registered before the error-mapping interceptor: this handler
  // needs the raw AxiosError, and its resolved retries flow into the next
  // interceptor's fulfilled handler.
  api.interceptors.response.use(undefined, createRetryInterceptor(api))

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
export const checkSessions = new CheckSessions(api)
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
export const usage = new Usage(api)
