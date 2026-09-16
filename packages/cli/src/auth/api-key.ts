import axios, { type AxiosError, type AxiosInstance } from 'axios'
import * as os from 'os'
import { jwtDecode } from 'jwt-decode'

import { getDefaults as getApiDefaults } from '../rest/api.js'
import { assignProxy } from '../services/proxy.js'

export interface ApiKeyExchangeDeps {
  createClient: (accessToken: string) => AxiosInstance
  hostname: () => string
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
  const { createClient, hostname } = { ...defaultDeps, ...deps }
  const client = createClient(accessToken)

  try {
    await client.get('/users/me')
  } catch (error: unknown) {
    if ((error as AxiosError).response?.status === 401) {
      await client.post('/users/', { accessToken })
    } else {
      throw error
    }
  }

  const apiKeyName = `CLI User Key (${hostname()})`
  const { data } = await client.post(`/users/me/api-keys?name=${apiKeyName}`)

  return data
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
