import axios from 'axios'

import { assignProxy } from '../services/proxy.js'

// OAuth 2.0 Device Authorization Grant (RFC 8628) against Checkly's Auth0 tenant.
// The user opens a URL on any device and enters a short code; the CLI polls for
// the tokens. Unlike the authorization-code flow this needs no local callback
// server, so it works over SSH, in containers and from agent sandboxes.

export const AUTH0_CLIENT_ID = 'mBtwLFVm39GVZ1HpSRBSdRiLFucYxmMb'
export const AUTH0_DEVICE_CODE_URL = 'https://auth.checklyhq.com/oauth/device/code'
export const AUTH0_TOKEN_URL = 'https://auth.checklyhq.com/oauth/token'
const AUTH0_SCOPES = 'openid profile email'
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const DEFAULT_INTERVAL_MS = 5_000
const SLOW_DOWN_STEP_MS = 5_000

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

    const { status, data } = await this.#deps.post(AUTH0_DEVICE_CODE_URL, params)

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

    while (this.#deps.now() + intervalMs <= auth.expiresAt) {
      await this.#deps.sleep(intervalMs)

      const { status, data } = await this.#deps.post(AUTH0_TOKEN_URL, params)

      if (status >= 200 && status < 300) {
        if (!data?.access_token || !data?.id_token) {
          throw new DeviceFlowError('invalid_response', 'The token response did not include the expected tokens.')
        }
        return { accessToken: data.access_token, idToken: data.id_token }
      }

      switch (data?.error) {
        case 'authorization_pending':
          continue
        case 'slow_down':
          intervalMs += SLOW_DOWN_STEP_MS
          continue
        default:
          throw errorFrom(data, 'token_request_failed')
      }
    }

    throw new DeviceFlowError('expired_token', 'The login code expired before it was used. Please run the login again.')
  }
}
