import axios from 'axios'

import { assignProxy } from '../services/proxy.js'
import config from '../services/config.js'

// OAuth 2.0 Device Authorization Grant (RFC 8628) against Checkly's Auth0 tenant.
// The user opens a URL on any device and enters a short code; the CLI polls for
// the tokens. Unlike the authorization-code flow this needs no local callback
// server, so it works over SSH, in containers and from agent sandboxes.

export const AUTH0_CLIENT_ID = 'mBtwLFVm39GVZ1HpSRBSdRiLFucYxmMb'

const deviceCodeUrl = () => `${config.getAuthUrl()}/oauth/device/code`
const tokenUrl = () => `${config.getAuthUrl()}/oauth/token`
const AUTH0_SCOPES = 'openid profile email'
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const DEFAULT_INTERVAL_MS = 5_000
const SLOW_DOWN_STEP_MS = 5_000
// A proxy or captive portal answering every poll in place of the login
// server would otherwise keep a waiting login silent until the code expires.
const MAX_UNEXPECTED_RESPONSES = 5
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
  | { state: 'approved', tokens: DeviceTokens, failure?: undefined, unexpected?: undefined }
  // `unexpected`: an answer that did not come from the login server (no OAuth body).
  | { state: 'pending' | 'slow_down', failure?: string, unexpected?: boolean }

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
  constructor (readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options)
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

function notFromLoginServer (what: string): string {
  return `${what} that did not come from the login server; check your network or proxy settings`
}

function unexpectedResponseError (): DeviceFlowError {
  return new DeviceFlowError('invalid_response',
    'The login server returned an unexpected response. Check your network or proxy settings and try again.')
}

/**
 * Names a failed request by its error code only: error messages can carry
 * request or proxy URLs, credentials included.
 */
function transportFailure (error: unknown): string {
  const code = (error as { code?: unknown })?.code
  return typeof code === 'string' ? code : 'network error'
}

function tokenParams (auth: DeviceAuthorization): URLSearchParams {
  return new URLSearchParams({
    grant_type: DEVICE_CODE_GRANT,
    device_code: auth.deviceCode,
    client_id: AUTH0_CLIENT_ID,
  })
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

    let response: OAuthResponse
    try {
      response = await this.#deps.post(deviceCodeUrl(), params)
    } catch (error) {
      throw new DeviceFlowError('network_error', `Could not reach the login server (${transportFailure(error)}). `
        + 'Check your network or proxy settings and try again.', { cause: error })
    }
    const { status, data } = response

    // A proxy or captive portal can answer in place of the login server, with
    // an HTML page and any status; without these checks the user would see an
    // unhelpful error or "undefined" for the URL and the code.
    if (status < 200 || status >= 300) {
      if (typeof data?.error !== 'string') {
        throw unexpectedResponseError()
      }
      throw errorFrom(data, 'device_authorization_failed')
    }

    const isText = (value: unknown) => typeof value === 'string' && value !== ''
    if (!isText(data?.device_code) || !isText(data?.user_code) || !isText(data?.verification_uri)
      || !(Number.isFinite(data?.expires_in) && data.expires_in > 0)) {
      throw unexpectedResponseError()
    }

    const intervalSeconds = typeof data.interval === 'number' ? data.interval : DEFAULT_INTERVAL_MS / 1000

    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: isText(data.verification_uri_complete)
        ? data.verification_uri_complete
        : data.verification_uri,
      expiresAt: this.#deps.now() + data.expires_in * 1000,
      intervalMs: intervalSeconds * 1000,
    }
  }

  async pollForTokens (auth: DeviceAuthorization): Promise<DeviceTokens> {
    const params = tokenParams(auth)
    let intervalMs = auth.intervalMs
    let lastFailure: string | undefined
    let unexpectedInARow = 0

    while (this.#deps.now() + intervalMs <= auth.expiresAt) {
      await this.#deps.sleep(intervalMs)

      const result = await this.#requestTokens(params)
      lastFailure = result.failure
      unexpectedInARow = result.unexpected ? unexpectedInARow + 1 : 0
      if (unexpectedInARow >= MAX_UNEXPECTED_RESPONSES) {
        throw unexpectedResponseError()
      }
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
   * A single token request without waiting, so a caller can check a stored
   * code and return at once. `tokens` once the user has approved; otherwise
   * `failure` says why the login server could not answer, if it could not
   * (the user may then have approved without the CLI seeing it yet).
   */
  async pollOnce (auth: DeviceAuthorization): Promise<{ tokens?: DeviceTokens, failure?: string }> {
    const result = await this.#requestTokens(tokenParams(auth))
    return result.state === 'approved' ? { tokens: result.tokens } : { failure: result.failure }
  }

  /**
   * One token request. Polling can last as long as the code is valid, often
   * after the user has already approved it in the browser, so a network
   * failure, a server-side error or an answer that did not come from the
   * login server (e.g. a proxy's or captive portal's page) counts as "try
   * again" rather than ending the login; only an OAuth error from the server
   * is final.
   */
  async #requestTokens (params: URLSearchParams): Promise<TokenRequestResult> {
    let response: OAuthResponse
    try {
      response = await this.#deps.post(tokenUrl(), params)
    } catch (error) {
      return { state: 'pending', failure: transportFailure(error) }
    }
    const { status, data } = response

    if (status >= 200 && status < 300) {
      if (!data?.access_token || !data?.id_token) {
        return { state: 'pending', failure: notFromLoginServer('a response without tokens'), unexpected: true }
      }
      return { state: 'approved', tokens: { accessToken: data.access_token, idToken: data.id_token } }
    }

    // Not counted as unexpected: an outage of the login server itself is
    // worth waiting out for as long as the code is valid.
    if (status >= 500) {
      return { state: 'pending', failure: `HTTP ${status}` }
    }
    if (data?.error === 'slow_down' || (status === 429 && data?.error === undefined)) {
      return { state: 'slow_down' }
    }
    if (data?.error === 'authorization_pending') {
      return { state: 'pending' }
    }
    if (typeof data?.error !== 'string') {
      return { state: 'pending', failure: notFromLoginServer(`HTTP ${status}`), unexpected: true }
    }
    throw errorFrom(data, 'token_request_failed')
  }
}
