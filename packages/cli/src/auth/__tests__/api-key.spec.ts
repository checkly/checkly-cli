import { beforeEach, describe, expect, it, vi } from 'vitest'

import { credentialsFromTokens, exchangeAccessTokenForApiKey } from '../api-key.js'
import { MissingResponseError, ServerError } from '../../rest/errors.js'

function axiosError (status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { statusCode: status, error: 'Error', message: `Status ${status}` } },
  })
}

describe('exchangeAccessTokenForApiKey()', () => {
  let client: { get: ReturnType<typeof vi.fn>, post: ReturnType<typeof vi.fn> }

  const sleep = vi.fn(async () => {})
  const deps = () => ({ createClient: () => client as any, hostname: () => 'my-laptop', sleep })

  beforeEach(() => {
    client = { get: vi.fn(), post: vi.fn() }
    sleep.mockClear()
  })

  it('creates a CLI API key for an existing Checkly user', async () => {
    client.get.mockResolvedValueOnce({ data: { id: 'user-1' } })
    client.post.mockResolvedValueOnce({ data: { key: 'cak_123' } })

    const result = await exchangeAccessTokenForApiKey('access-token', deps())

    expect(result).toEqual({ key: 'cak_123' })
    expect(client.get).toHaveBeenCalledWith('/users/me')
    expect(client.post).toHaveBeenCalledTimes(1)
    expect(client.post).toHaveBeenCalledWith('/users/me/api-keys?name=CLI User Key (my-laptop)')
  })

  it('registers a brand-new user first when Checkly does not know the Auth0 identity yet', async () => {
    client.get.mockRejectedValueOnce(axiosError(401))
    client.post
      .mockResolvedValueOnce({ data: { id: 'user-new' } })
      .mockResolvedValueOnce({ data: { key: 'cak_new' } })

    const result = await exchangeAccessTokenForApiKey('access-token', deps())

    expect(result).toEqual({ key: 'cak_new' })
    expect(client.post).toHaveBeenNthCalledWith(1, '/users/', { accessToken: 'access-token' })
    expect(client.post).toHaveBeenNthCalledWith(2, '/users/me/api-keys?name=CLI User Key (my-laptop)')
  })

  it('propagates other failures instead of registering', async () => {
    client.get.mockRejectedValue(axiosError(500))

    await expect(exchangeAccessTokenForApiKey('access-token', deps())).rejects.toBeInstanceOf(ServerError)
    expect(client.post).not.toHaveBeenCalled()
    expect(client.get).toHaveBeenCalledTimes(3)
  })

  const networkError = (code: string) => Object.assign(new Error(code), { isAxiosError: true, code })

  it('retries brief failures of the user lookup and registration, since the login code is spent', async () => {
    client.get
      .mockRejectedValueOnce(axiosError(502))
      .mockRejectedValueOnce(axiosError(401))
      .mockResolvedValue({ data: {} })
    client.post
      .mockRejectedValueOnce(axiosError(408))
      .mockResolvedValueOnce({ data: { key: 'cak_retried' } })

    await expect(exchangeAccessTokenForApiKey('access-token', deps())).resolves.toEqual({ key: 'cak_retried' })

    expect(sleep.mock.calls).toEqual([[1_000], [3_000]])
    // The registration that failed is not repeated blindly: the next lookup finds the user.
    expect(client.post).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['a refused connection', networkError('ECONNREFUSED')],
    ['a 503', axiosError(503)],
    ['a 429', axiosError(429)],
  ])('retries creating the key after %s, which the server did not act on', async (_, failure) => {
    client.get.mockResolvedValue({ data: {} })
    client.post.mockRejectedValueOnce(failure).mockResolvedValueOnce({ data: { key: 'cak_retried' } })

    await expect(exchangeAccessTokenForApiKey('access-token', deps())).resolves.toEqual({ key: 'cak_retried' })
  })

  it.each([
    ['a dropped connection', networkError('ECONNRESET')],
    ['a gateway error', axiosError(502)],
  ])('does not repeat creating the key after %s, which may have created one', async (_, failure) => {
    client.get.mockResolvedValue({ data: {} })
    client.post.mockRejectedValue(failure)

    await expect(exchangeAccessTokenForApiKey('access-token', deps())).rejects.toThrow()
    expect(client.post).toHaveBeenCalledTimes(1)
  })

  it('retries a server error without a body it can parse', async () => {
    client.get
      .mockRejectedValueOnce(Object.assign(new Error('502'), { isAxiosError: true, response: { status: 502, data: {} } }))
      .mockResolvedValue({ data: {} })
    client.post.mockResolvedValueOnce({ data: { key: 'cak' } })

    await expect(exchangeAccessTokenForApiKey('access-token', deps())).resolves.toEqual({ key: 'cak' })
  })

  it('does not retry a failure that would not change', async () => {
    client.get.mockResolvedValue({ data: {} })
    client.post.mockRejectedValue(axiosError(403))

    await expect(exchangeAccessTokenForApiKey('access-token', deps())).rejects.toThrow()
    expect(client.post).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('reports an unreachable API as a missing response', async () => {
    client.get.mockResolvedValue({ data: {} })
    client.post.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { isAxiosError: true, code: 'ECONNREFUSED' }))

    await expect(exchangeAccessTokenForApiKey('access-token', deps())).rejects.toBeInstanceOf(MissingResponseError)
  })

  it('sends the access token as a bearer token on the default client', async () => {
    const createClient = vi.fn(() => client as any)
    client.get.mockResolvedValueOnce({ data: {} })
    client.post.mockResolvedValueOnce({ data: { key: 'k' } })

    await exchangeAccessTokenForApiKey('access-token', { createClient, hostname: () => 'h', sleep })

    expect(createClient).toHaveBeenCalledWith('access-token')
  })
})

function fakeJwt (payload: Record<string, unknown>): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`
}

describe('credentialsFromTokens()', () => {
  it('reads the display name from the ID token and exchanges the access token for an API key', async () => {
    const client = { get: vi.fn().mockResolvedValue({ data: {} }), post: vi.fn().mockResolvedValue({ data: { key: 'cak_1' } }) }

    const credentials = await credentialsFromTokens(
      { accessToken: 'access-token', idToken: fakeJwt({ name: 'Ada Lovelace', email: 'ada@example.com' }) },
      { createClient: () => client as any, hostname: () => 'h' },
    )

    expect(credentials).toEqual({ name: 'Ada Lovelace', key: 'cak_1' })
  })
})
