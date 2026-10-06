import axios, { isAxiosError, type AxiosError, type AxiosInstance } from 'axios'
import * as os from 'os'
import { jwtDecode } from 'jwt-decode'

import { getDefaults as getApiDefaults } from '../rest/api.js'
import { handleErrorResponse } from '../rest/errors.js'
import { assignProxy } from '../services/proxy.js'

export interface ApiKeyExchangeDeps {
  createClient: (accessToken: string) => AxiosInstance
  hostname: () => string
  sleep: (ms: number) => Promise<void>
}

function createDefaultClient (accessToken: string): AxiosInstance {
  // Keep axios instance stateless
  const { baseURL } = getApiDefaults()
  const axiosConf = assignProxy(baseURL, {
    baseURL,
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  return axios.create(axiosConf)
}

const defaultDeps: ApiKeyExchangeDeps = {
  createClient: createDefaultClient,
  hostname: () => os.hostname(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

// The device code is spent once its tokens are issued, so an exchange that
// fails here costs the user another approval in the browser; ride out a
// brief API hiccup first.
const RETRY_DELAYS_MS = [1_000, 3_000]

// Failures where the request never reached the server.
const NOT_SENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'])

/**
 * Any brief failure: for requests that are safe to repeat. Wider than the
 * shared API client's policy (rest/retry.ts), which leaves out 500 and 408:
 * here giving up costs the user another browser approval, not just a
 * failed command.
 */
function isTransient (error: AxiosError): boolean {
  const status = error.response?.status
  return status === undefined || status >= 500 || status === 408 || status === 429
}

/**
 * A failure the server certainly did not act on: for creating an API key,
 * where repeating a request that was processed but whose answer was lost
 * would leave an extra long-lived key nobody holds.
 */
function wasNotProcessed (error: AxiosError): boolean {
  if (error.response) {
    return error.response.status === 503 || error.response.status === 429
  }
  return NOT_SENT_CODES.has(error.code ?? '')
}

async function withRetries<T> (
  sleep: (ms: number) => Promise<void>,
  request: () => Promise<T>,
  retryable: (error: AxiosError) => boolean,
): Promise<T> {
  for (const delayMs of RETRY_DELAYS_MS) {
    try {
      return await request()
    } catch (error) {
      if (!isAxiosError(error) || !retryable(error)) {
        throw error
      }
      await sleep(delayMs)
    }
  }
  return request()
}

/**
 * Trades an Auth0 access token for a long-lived Checkly API key, registering
 * the user with Checkly first when the Auth0 identity is not known yet
 * (that is what a fresh sign-up looks like from the CLI's point of view).
 */
export async function exchangeAccessTokenForApiKey (
  accessToken: string,
  deps: Partial<ApiKeyExchangeDeps> = {},
): Promise<{ key: string }> {
  const { createClient, hostname, sleep } = { ...defaultDeps, ...deps }
  const client = createClient(accessToken)

  try {
    // Repeating this is safe: a registration that went through is seen by
    // the next GET, so it is not attempted again.
    await withRetries(sleep, async () => {
      try {
        await client.get('/users/me')
      } catch (error: unknown) {
        if ((error as AxiosError).response?.status === 401) {
          await client.post('/users/', { accessToken })
        } else {
          throw error
        }
      }
    }, isTransient)

    const apiKeyName = `CLI User Key (${hostname()})`
    const { data } = await withRetries(sleep,
      () => client.post(`/users/me/api-keys?name=${apiKeyName}`), wasNotProcessed)

    return data
  } catch (error) {
    // The same typed errors as the regular API client, so callers can tell a
    // failed or unreachable Checkly API from other failures.
    handleErrorResponse(error as Error)
  }
}

export interface Credentials {
  /** Display name from the OpenID ID token. */
  name: string
  /** Long-lived Checkly API key. */
  key: string
}

export async function credentialsFromTokens (
  tokens: { accessToken: string, idToken: string },
  deps: Partial<ApiKeyExchangeDeps> = {},
): Promise<Credentials> {
  const { name } = jwtDecode<{ name: string }>(tokens.idToken)
  const { key } = await exchangeAccessTokenForApiKey(tokens.accessToken, deps)
  return { name, key }
}
