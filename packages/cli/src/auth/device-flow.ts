import axios from 'axios'

import { assignProxy } from '../services/proxy.js'
import config from '../services/config.js'

// OAuth 2.0 Device Authorization Grant (RFC 8628) against Checkly's Auth0 tenant.
// The user opens a URL on any device and enters a short code; the CLI polls for
// the tokens. Unlike the authorization-code flow this needs no local callback
// server, so it works over SSH, in containers and from agent sandboxes.

export const AUTH0_CLIENT_ID = 'mBtwLFVm39GVZ1HpSRBSdRiLFucYxmMb'
export const AUTH0_DEVICE_CODE_URL = 'https://auth.checklyhq.com/oauth/device/code'
export const AUTH0_TOKEN_URL = 'https://auth.checklyhq.com/oauth/token'

const deviceCodeUrl = () => `${config.getAuthUrl()}/oauth/device/code`
const tokenUrl = () => `${config.getAuthUrl()}/oauth/token`
const AUTH0_SCOPES = 'openid profile email'
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const DEFAULT_INTERVAL_MS = 5_000
const SLOW_DOWN_STEP_MS = 5_000
const REQUEST_TIMEOUT_MS = 30_000

export interface DeviceAuthorization {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  /** Epoch milliseconds after which the device code is no longer valid. */
  expiresAt: number
  intervalMs: number
}

export interface DeviceTokens {
  accessToken: string
  idToken: string
}

type TokenRequestResult =
  | { state: 'approved', tokens: DeviceTokens, failure?: undefined }
  | { state: 'pending' | 'slow_down', failure?: string }

export interface OAuthResponse {
  status: number
  data: any
}

export interface DeviceFlowDeps {
  /** Must resolve for non-2xx responses too; the flow reads OAuth error codes from the body. */
  post: (url: string, params: URLSearchParams) => Promise<OAuthResponse>
  sleep: (ms: number) => Promise<void>
  now: () => number
}

export class DeviceFlowError extends Error {
  constructor (readonly code: string, message: string) {
    super(message)
    this.name = 'DeviceFlowError'
  }
}

/** The Auth0 client does not have the device_code grant enabled. */
export class DeviceFlowNotAllowedError extends DeviceFlowError {
  constructor (message: string) {
    super('unauthorized_client', message)
    this.name = 'DeviceFlowNotAllowedError'
  }
}

const defaultDeps: DeviceFlowDeps = {
  post: async (url, params) => {
    const { status, data } = await axios.post(url, params, assignProxy(url, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Encoding': '*',
      },
      validateStatus: () => true,
      timeout: REQUEST_TIMEOUT_MS,
    }))
    return { status, data }
  },
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  now: () => Date.now(),
}

function errorFrom (data: any, fallback: string): DeviceFlowError {
  const code: string = data?.error ?? fallback
  const message: string = data?.error_description ?? `Authentication failed (${code})`
  if (code === 'unauthorized_client') {
    return new DeviceFlowNotAllowedError(message)
  }
  return new DeviceFlowError(code, message)
}

export class DeviceFlow {
  #deps: DeviceFlowDeps

  constructor (deps: Partial<DeviceFlowDeps> = {}) {
    this.#deps = { ...defaultDeps, ...deps }
  }

  async requestAuthorization (): Promise<DeviceAuthorization> {
    const params = new URLSearchParams({
      client_id: AUTH0_CLIENT_ID,
      scope: AUTH0_SCOPES,
    })

    const { status, data } = await this.#deps.post(deviceCodeUrl(), params)

    if (status < 200 || status >= 300) {
      throw errorFrom(data, 'device_authorization_failed')
    }

    const intervalSeconds = typeof data.interval === 'number' ? data.interval : DEFAULT_INTERVAL_MS / 1000

    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete,
      expiresAt: this.#deps.now() + data.expires_in * 1000,
      intervalMs: intervalSeconds * 1000,
    }
  }

  async pollForTokens (auth: DeviceAuthorization): Promise<DeviceTokens> {
    const params = new URLSearchParams({
      grant_type: DEVICE_CODE_GRANT,
      device_code: auth.deviceCode,
      client_id: AUTH0_CLIENT_ID,
    })

    let intervalMs = auth.intervalMs
    let lastFailure: string | undefined

    while (this.#deps.now() + intervalMs <= auth.expiresAt) {
      await this.#deps.sleep(intervalMs)

      const result = await this.#requestTokens(params)
      lastFailure = result.failure
      if (result.state === 'slow_down') {
        intervalMs += SLOW_DOWN_STEP_MS
      } else if (result.state === 'approved') {
        return result.tokens
      }
    }

    // A code the user approved can still expire here when the login server
    // was unreachable at the end; say so rather than blaming the user.
    throw new DeviceFlowError('expired_token', lastFailure
      ? `The login code expired; the last attempt to reach the login server failed (${lastFailure}). `
      + 'Please run the login again.'
      : 'The login code expired before it was used. Please run the login again.')
  }

  /**
   * One token request. Polling can last as long as the code is valid, often
   * after the user has already approved it in the browser, so a network
   * failure or a server-side error counts as "try again" rather than ending
   * the login; only an OAuth error from the server is final.
   */
  async #requestTokens (params: URLSearchParams): Promise<TokenRequestResult> {
    let response: OAuthResponse
    try {
      response = await this.#deps.post(tokenUrl(), params)
    } catch (error: any) {
      return { state: 'pending', failure: error?.code ?? error?.message ?? String(error) }
    }
    const { status, data } = response

    if (status >= 200 && status < 300) {
      if (!data?.access_token || !data?.id_token) {
        throw new DeviceFlowError('invalid_response', 'The token response did not include the expected tokens.')
      }
      return { state: 'approved', tokens: { accessToken: data.access_token, idToken: data.id_token } }
    }

    if (status >= 500) {
      return { state: 'pending', failure: `HTTP ${status}` }
    }
    if (data?.error === 'slow_down' || (status === 429 && data?.error === undefined)) {
      return { state: 'slow_down' }
    }
    if (data?.error === 'authorization_pending') {
      return { state: 'pending' }
    }
    throw errorFrom(data, 'token_request_failed')
  }
}
