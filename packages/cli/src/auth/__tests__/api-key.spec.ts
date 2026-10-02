import { beforeEach, describe, expect, it, vi } from 'vitest'

import { credentialsFromTokens, exchangeAccessTokenForApiKey } from '../api-key.js'

function axiosError (status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status },
  })
}

describe('exchangeAccessTokenForApiKey()', () => {
  let client: { get: ReturnType<typeof vi.fn>, post: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    client = { get: vi.fn(), post: vi.fn() }
  })

  it('creates a CLI API key for an existing Checkly user', async () => {
    client.get.mockResolvedValueOnce({ data: { id: 'user-1' } })
    client.post.mockResolvedValueOnce({ data: { key: 'cak_123' } })

    const result = await exchangeAccessTokenForApiKey('access-token', {
      createClient: () => client as any,
      hostname: () => 'my-laptop',
    })

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

    const result = await exchangeAccessTokenForApiKey('access-token', {
      createClient: () => client as any,
      hostname: () => 'my-laptop',
    })

    expect(result).toEqual({ key: 'cak_new' })
    expect(client.post).toHaveBeenNthCalledWith(1, '/users/', { accessToken: 'access-token' })
    expect(client.post).toHaveBeenNthCalledWith(2, '/users/me/api-keys?name=CLI User Key (my-laptop)')
  })

  it('propagates other failures instead of registering', async () => {
    client.get.mockRejectedValueOnce(axiosError(500))

    await expect(exchangeAccessTokenForApiKey('access-token', {
      createClient: () => client as any,
      hostname: () => 'my-laptop',
    })).rejects.toThrow('status code 500')
    expect(client.post).not.toHaveBeenCalled()
  })

  it('sends the access token as a bearer token on the default client', async () => {
    const createClient = vi.fn(() => client as any)
    client.get.mockResolvedValueOnce({ data: {} })
    client.post.mockResolvedValueOnce({ data: { key: 'k' } })

    await exchangeAccessTokenForApiKey('access-token', { createClient, hostname: () => 'h' })

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
