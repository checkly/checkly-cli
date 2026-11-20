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
import SpendingCaps from './spending-cap.js'
import { ForbiddenError, handleErrorResponse, NotFoundError, UnauthorizedError } from './errors.js'
import { createRetryInterceptor } from './retry.js'
import { detectCliMode, detectOperator } from '../helpers/cli-mode.js'
import { accountNotAvailable } from '../helpers/accounts.js'

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
    const relogin = suggestLogin && source !== 'environment'
    if (err instanceof UnauthorizedError) {
      throw new Error(`Authentication failed with account id "${accountId}" and API key "...${apiKey.slice(-4)}".`
        + (relogin ? ' Run `npx checkly login` to log in again.' : ''), { cause: err })
    }
    // Name where the account comes from, except while switching: the account
    // checked then is not the configured one.
    if (suggestLogin && (err instanceof ForbiddenError || err instanceof NotFoundError)) {
      const available = source === 'account_override'
        ? await accounts.getAll().then(({ data }) => data, () => undefined)
        : undefined
      throw new Error(accountNotAvailable(accountId, available), { cause: err })
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

  // Declare who is driving the CLI: `AGENT` in agent mode, `CLI` otherwise.
  // Agents and humans share API keys, so this is the backend's only way to tell
  // them apart. It classifies every request (usage analytics, the provenance of
  // checks created through the API, import plans), and uncommitted import plans
  // marked `AGENT` are garbage-collected after a few days.
  config.headers['x-checkly-source'] = detectCliMode() === 'agent' ? 'AGENT' : 'CLI'
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

let instance: AxiosInstance | undefined

/**
 * The CLI's axios instance, created on first use rather than when this
 * module loads. Creating it reads the configured credentials and API host
 * (from the environment or the `checkly login` store, which may create a
 * config file), and every construct imports this module indirectly, so an
 * eager client would do that for any program that merely imports a
 * construct or the codegen.
 */
export function getApi (): AxiosInstance {
  instance ??= init()
  return instance
}

export const accounts = new Accounts(getApi)
export const user = new Users(getApi)
export const projects = new Projects(getApi)
export const assets = new Assets(getApi)
export const assetManifests = new AssetManifests(getApi)
export const runtimes = new Runtimes(getApi)
export const locations = new Locations(getApi)
export const privateLocations = new PrivateLocations(getApi)
export const testSessions = new TestSessions(getApi)
export const checkSessions = new CheckSessions(getApi)
export const environmentVariables = new EnvironmentVariables(getApi)
export const heartbeatCheck = new HeartbeatChecks(getApi)
export const checklyStorage = new ChecklyStorage(getApi)
export const checks = new Checks(getApi)
export const checkStatuses = new CheckStatuses(getApi)
export const checkResults = new CheckResults(getApi)
export const checkGroups = new CheckGroups(getApi)
export const errorGroups = new ErrorGroups(getApi)
export const testSessionErrorGroups = new TestSessionErrorGroups(getApi)
export const statusPages = new StatusPages(getApi)
export const incidents = new Incidents(getApi)
export const analytics = new Analytics(getApi)
export const batchAnalytics = new BatchAnalytics(getApi)
export const entitlements = new Entitlements(getApi)
export const accountMembers = new AccountMembers(getApi)
export const alertChannels = new AlertChannels(getApi)
export const alertNotifications = new AlertNotifications(getApi)
export const rca = new Rca(getApi)
export const cancel = new Cancel(getApi)
export const usage = new Usage(getApi)
export const spendingCap = new SpendingCaps(getApi)
