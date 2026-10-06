import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AUTH0_CLIENT_ID,
  DeviceFlow,
  DeviceFlowError,
  DeviceFlowNotAllowedError,
  type DeviceAuthorization,
} from '../device-flow.js'
import config from '../../services/config.js'

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
      expect(post.mock.calls[0]![0]).toBe(`${config.getAuthUrl()}/oauth/device/code`)
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

    it.each([
      ['an HTML page', '<html>Please sign in to the Wi-Fi</html>'],
      ['a body without a user code', { ...authorizationResponse, user_code: undefined }],
      ['a non-positive lifetime', { ...authorizationResponse, expires_in: 0 }],
      ['a non-numeric lifetime', { ...authorizationResponse, expires_in: '900' }],
    ])('rejects a success response with %s', async (_, data) => {
      post.mockResolvedValueOnce({ status: 200, data })

      const error = await flow.requestAuthorization().catch(e => e)

      expect(error).toBeInstanceOf(DeviceFlowError)
      expect(error.code).toBe('invalid_response')
    })

    it('points at the network when an error response is not from the login server', async () => {
      post.mockResolvedValueOnce({ status: 407, data: '<html>Proxy Authentication Required</html>' })

      const error = await flow.requestAuthorization().catch(e => e)

      expect(error.code).toBe('invalid_response')
      expect(error.message).toContain('proxy')
    })

    it.each([
      ['its error code', Object.assign(new Error('getaddrinfo ENOTFOUND auth.checklyhq.com'), { code: 'ENOTFOUND' }),
        'ENOTFOUND'],
      ['a fixed phrase, never the message', new Error('connect to http://user:secret@proxy.test:3128 failed'),
        'network error'],
    ])('reports an unreachable login server by %s', async (_, failure, named) => {
      post.mockRejectedValueOnce(failure)

      const error = await flow.requestAuthorization().catch(e => e)

      expect(error).toBeInstanceOf(DeviceFlowError)
      expect(error.code).toBe('network_error')
      expect(error.message).toContain(`(${named})`)
      expect(error.message).not.toContain('secret')
    })

    it('falls back to the plain verification URL when the server omits the complete one', async () => {
      const withoutCompleteUri = { ...authorizationResponse, verification_uri_complete: undefined }
      post.mockResolvedValueOnce({ status: 200, data: withoutCompleteUri })

      const auth = await flow.requestAuthorization()

      expect(auth.verificationUriComplete).toBe('https://auth.checklyhq.com/activate')
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
      expect(post.mock.calls[0]![0]).toBe(`${config.getAuthUrl()}/oauth/token`)
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

    it('keeps polling through network errors and server errors', async () => {
      post
        .mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))
        .mockResolvedValueOnce({ status: 502, data: '<html>Bad Gateway</html>' })
        .mockResolvedValueOnce({ status: 503, data: { error: 'temporarily_unavailable' } })
        .mockResolvedValueOnce({ status: 200, data: { access_token: 'at', id_token: 'idt' } })

      const tokens = await flow.pollForTokens(auth)

      expect(tokens).toEqual({ accessToken: 'at', idToken: 'idt' })
      expect(sleep).toHaveBeenNthCalledWith(2, 5_000)
      expect(sleep).toHaveBeenNthCalledWith(4, 5_000)
    })

    it('backs off on a rate-limit response without an OAuth error', async () => {
      post
        .mockResolvedValueOnce({ status: 429, data: 'Too Many Requests' })
        .mockResolvedValueOnce({ status: 200, data: { access_token: 'at', id_token: 'idt' } })

      await flow.pollForTokens(auth)

      expect(sleep).toHaveBeenNthCalledWith(2, 10_000)
    })

    it('still gives up when the code expires while the server keeps failing, and names the failure', async () => {
      post.mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND auth.checklyhq.com'), { code: 'ENOTFOUND' }))

      const error = await flow.pollForTokens({ ...auth, expiresAt: now + 12_000 }).catch(e => e)

      expect(error).toBeInstanceOf(DeviceFlowError)
      expect(error.code).toBe('expired_token')
      expect(error.message).toContain('ENOTFOUND')
    })

    it('fails on a client error without an OAuth error code', async () => {
      post.mockResolvedValueOnce({ status: 400, data: 'Bad Request' })

      const error = await flow.pollForTokens(auth).catch(e => e)

      expect(error).toBeInstanceOf(DeviceFlowError)
      expect(error.code).toBe('token_request_failed')
    })

    it('fails when the server returns a success status without tokens', async () => {
      post.mockResolvedValueOnce({ status: 200, data: { token_type: 'Bearer' } })

      const error = await flow.pollForTokens(auth).catch(e => e)

      expect(error).toBeInstanceOf(DeviceFlowError)
      expect(error.code).toBe('invalid_response')
    })
  })

  describe('pollOnce()', () => {
    const auth: DeviceAuthorization = {
      deviceCode: 'dev-code-123',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://auth.checklyhq.com/activate',
      verificationUriComplete: 'https://auth.checklyhq.com/activate?user_code=ABCD-EFGH',
      expiresAt: 1_000_000 + 900_000,
      intervalMs: 5_000,
    }

    it('returns the tokens without waiting once the user has approved', async () => {
      post.mockResolvedValueOnce({ status: 200, data: { access_token: 'at', id_token: 'idt' } })

      await expect(flow.pollOnce(auth)).resolves.toEqual({ tokens: { accessToken: 'at', idToken: 'idt' } })
      expect(sleep).not.toHaveBeenCalled()
      expect(params(post.mock.calls[0]!).device_code).toBe('dev-code-123')
    })

    it.each([
      ['authorization_pending', { status: 403, data: { error: 'authorization_pending' } }],
      ['slow_down', { status: 429, data: { error: 'slow_down' } }],
    ])('returns no tokens and no failure on %s', async (_, response) => {
      post.mockResolvedValueOnce(response)

      await expect(flow.pollOnce(auth)).resolves.toEqual({ failure: undefined })
      expect(sleep).not.toHaveBeenCalled()
    })

    it('names the failure when the login server answers with an error', async () => {
      post.mockResolvedValueOnce({ status: 503, data: 'Service Unavailable' })

      await expect(flow.pollOnce(auth)).resolves.toEqual({ failure: 'HTTP 503' })
    })

    it('names the failure when the login server cannot be reached', async () => {
      post.mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))

      await expect(flow.pollOnce(auth)).resolves.toEqual({ failure: 'ECONNRESET' })
    })

    it('never names the failure by an error message, which can carry proxy credentials', async () => {
      post.mockRejectedValueOnce(new Error('connect to http://user:secret@proxy.test:3128 failed'))

      await expect(flow.pollOnce(auth)).resolves.toEqual({ failure: 'network error' })
    })

    it('throws when the code was denied or already used', async () => {
      post.mockResolvedValueOnce({ status: 400, data: { error: 'invalid_grant' } })

      const error = await flow.pollOnce(auth).catch(e => e)

      expect(error).toBeInstanceOf(DeviceFlowError)
      expect(error.code).toBe('invalid_grant')
    })
  })
})
