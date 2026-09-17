import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AUTH0_CLIENT_ID,
  AUTH0_DEVICE_CODE_URL,
  AUTH0_TOKEN_URL,
  DeviceFlow,
  DeviceFlowError,
  DeviceFlowNotAllowedError,
  type DeviceAuthorization,
} from '../device-flow.js'

const authorizationResponse = {
  device_code: 'dev-code-123',
  user_code: 'ABCD-EFGH',
  verification_uri: 'https://auth.checklyhq.com/activate',
  verification_uri_complete: 'https://auth.checklyhq.com/activate?user_code=ABCD-EFGH',
  expires_in: 900,
  interval: 5,
}

function params (call: unknown[]): Record<string, string> {
  const body = call[1] as URLSearchParams
  return Object.fromEntries(body.entries())
}

describe('DeviceFlow', () => {
  let post: ReturnType<typeof vi.fn>
  let sleep: ReturnType<typeof vi.fn>
  let now: number
  let flow: DeviceFlow

  beforeEach(() => {
    now = 1_000_000
    post = vi.fn()
    sleep = vi.fn((ms: number) => {
      now += ms
      return Promise.resolve()
    })
    flow = new DeviceFlow({ post, sleep, now: () => now })
  })

  describe('requestAuthorization()', () => {
    it('requests a device code for the CLI client with the OpenID scopes', async () => {
      post.mockResolvedValueOnce({ status: 200, data: authorizationResponse })

      const auth = await flow.requestAuthorization()

      expect(post).toHaveBeenCalledTimes(1)
      expect(post.mock.calls[0]![0]).toBe(AUTH0_DEVICE_CODE_URL)
      expect(params(post.mock.calls[0]!)).toEqual({
        client_id: AUTH0_CLIENT_ID,
        scope: 'openid profile email',
      })
      expect(auth).toEqual<DeviceAuthorization>({
        deviceCode: 'dev-code-123',
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://auth.checklyhq.com/activate',
        verificationUriComplete: 'https://auth.checklyhq.com/activate?user_code=ABCD-EFGH',
        expiresAt: now + 900_000,
        intervalMs: 5_000,
      })
    })

    it('defaults the polling interval to 5 seconds when the server omits it', async () => {
      const withoutInterval: Partial<typeof authorizationResponse> = { ...authorizationResponse }
      delete withoutInterval.interval
      post.mockResolvedValueOnce({ status: 200, data: withoutInterval })

      const auth = await flow.requestAuthorization()

      expect(auth.intervalMs).toBe(5_000)
    })

    it('throws DeviceFlowNotAllowedError when the grant is not enabled for the client', async () => {
      post.mockResolvedValueOnce({
        status: 403,
        data: {
          error: 'unauthorized_client',
          error_description: 'Grant type \'urn:ietf:params:oauth:grant-type:device_code\' not allowed for the client.',
        },
      })

      await expect(flow.requestAuthorization()).rejects.toBeInstanceOf(DeviceFlowNotAllowedError)
    })

    it('throws DeviceFlowError with the server error code for other failures', async () => {
      post.mockResolvedValueOnce({
        status: 400,
        data: { error: 'invalid_scope', error_description: 'Scope is not allowed' },
      })

      const error = await flow.requestAuthorization().catch(e => e)

      expect(error).toBeInstanceOf(DeviceFlowError)
      expect(error.code).toBe('invalid_scope')
      expect(error.message).toContain('Scope is not allowed')
    })
  })

  describe('pollForTokens()', () => {
    const auth: DeviceAuthorization = {
      deviceCode: 'dev-code-123',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://auth.checklyhq.com/activate',
      verificationUriComplete: 'https://auth.checklyhq.com/activate?user_code=ABCD-EFGH',
      expiresAt: 1_000_000 + 900_000,
      intervalMs: 5_000,
    }

    it('polls the token endpoint with the device code grant until the user approves', async () => {
      post
        .mockResolvedValueOnce({ status: 403, data: { error: 'authorization_pending' } })
        .mockResolvedValueOnce({ status: 403, data: { error: 'authorization_pending' } })
        .mockResolvedValueOnce({ status: 200, data: { access_token: 'at', id_token: 'idt' } })

      const tokens = await flow.pollForTokens(auth)

      expect(tokens).toEqual({ accessToken: 'at', idToken: 'idt' })
      expect(post).toHaveBeenCalledTimes(3)
      expect(post.mock.calls[0]![0]).toBe(AUTH0_TOKEN_URL)
      expect(params(post.mock.calls[0]!)).toEqual({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: 'dev-code-123',
        client_id: AUTH0_CLIENT_ID,
      })
      // Waits the server interval before every attempt.
      expect(sleep).toHaveBeenCalledTimes(3)
      expect(sleep).toHaveBeenNthCalledWith(1, 5_000)
      expect(sleep).toHaveBeenNthCalledWith(2, 5_000)
    })

    it('backs off by 5 seconds when the server answers slow_down', async () => {
      post
        .mockResolvedValueOnce({ status: 429, data: { error: 'slow_down' } })
        .mockResolvedValueOnce({ status: 403, data: { error: 'authorization_pending' } })
        .mockResolvedValueOnce({ status: 200, data: { access_token: 'at', id_token: 'idt' } })

      await flow.pollForTokens(auth)

      expect(sleep).toHaveBeenNthCalledWith(1, 5_000)
      expect(sleep).toHaveBeenNthCalledWith(2, 10_000)
      expect(sleep).toHaveBeenNthCalledWith(3, 10_000)
    })

    it('throws when the user denies access', async () => {
      post.mockResolvedValueOnce({ status: 403, data: { error: 'access_denied', error_description: 'User denied' } })

      const error = await flow.pollForTokens(auth).catch(e => e)

      expect(error).toBeInstanceOf(DeviceFlowError)
      expect(error.code).toBe('access_denied')
    })

    it('throws when the server reports the device code expired', async () => {
      post.mockResolvedValueOnce({ status: 403, data: { error: 'expired_token' } })

      const error = await flow.pollForTokens(auth).catch(e => e)

      expect(error).toBeInstanceOf(DeviceFlowError)
      expect(error.code).toBe('expired_token')
    })

    it('stops polling once the local expiry passes, even if the server keeps saying pending', async () => {
      post.mockResolvedValue({ status: 403, data: { error: 'authorization_pending' } })

      const error = await flow.pollForTokens({ ...auth, expiresAt: now + 12_000 }).catch(e => e)

      expect(error).toBeInstanceOf(DeviceFlowError)
      expect(error.code).toBe('expired_token')
      // 12s budget at 5s interval: attempts at t=5s and t=10s, then the next sleep crosses the deadline.
      expect(post).toHaveBeenCalledTimes(2)
    })

    it('fails when the server returns a success status without tokens', async () => {
      post.mockResolvedValueOnce({ status: 200, data: { token_type: 'Bearer' } })

      const error = await flow.pollForTokens(auth).catch(e => e)

      expect(error).toBeInstanceOf(DeviceFlowError)
      expect(error.code).toBe('invalid_response')
    })
  })
})
