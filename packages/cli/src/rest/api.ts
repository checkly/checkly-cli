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
import ChecklyStorage from './checkly-storage'
import Checks from './checks'
import CheckStatuses from './check-statuses'
import CheckResults from './check-results'
import CheckGroups from './check-groups'
import ErrorGroups from './error-groups'
import StatusPages from './status-pages'
import Incidents from './incidents'
import { handleErrorResponse, UnauthorizedError } from './errors'

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

export function detectOperator (): string {
  if (process.env.CLAUDECODE) return 'claude-code'
  if (process.env.CURSOR_TRACE_ID) return 'cursor'
  if (process.env.TERM_PROGRAM === 'vscode') return 'vscode'
  if (process.env.GITHUB_COPILOT) return 'github-copilot'
  if (process.env.AIDER) return 'aider'
  if (process.env.WINDSURF || process.env.CODEIUM_ENV) return 'windsurf'
  if (process.env.GITHUB_ACTIONS) return 'github-actions'
  if (process.env.GITLAB_CI) return 'gitlab-ci'
  if (process.env.CI) return 'ci'
  return 'manual'
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
export const statusPages = new StatusPages(api)
export const incidents = new Incidents(api)
