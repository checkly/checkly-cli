import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ForbiddenError, handleErrorResponse, isAccountNotAccessible, MissingResponseError, PayloadTooLargeError,
  ProxyConnectionError,
} from '../errors.js'

const proxyVars = ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'no_proxy', 'NO_PROXY', 'all_proxy', 'ALL_PROXY']
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of proxyVars) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of proxyVars) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = savedEnv[key]
    }
  }
})

function connectionError (code: string): AxiosError {
  const config = { baseURL: 'https://api.checklyhq.com', url: '/v1/whoami' } as InternalAxiosRequestConfig
  const error = new AxiosError('failed', code, config, {}, undefined)
  // Node surfaces multi-address connect failures as an AggregateError cause.
  error.cause = new AggregateError([
    Object.assign(new Error('connect'), { code }),
    Object.assign(new Error('connect'), { code }),
  ])
  return error
}

describe('handleErrorResponse with a proxy configured', () => {
  it('reports the proxy when it refuses the connection', () => {
    process.env.https_proxy = 'http://user:secret@localhost:1234'

    try {
      handleErrorResponse(connectionError('ECONNREFUSED'))
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ProxyConnectionError)
      // Credentials are stripped and the proxy origin is named.
      expect((err as Error).message).toContain('http://localhost:1234')
      expect((err as Error).message).not.toContain('secret')
    }
  })

  it('detects the failure code when it is only on the AggregateError cause', () => {
    process.env.https_proxy = 'http://localhost:1234'
    const config = { baseURL: 'https://api.checklyhq.com', url: '/v1/whoami' } as InternalAxiosRequestConfig
    // The AxiosError's own code is benign; only the aggregated causes carry it.
    const error = new AxiosError('failed', 'ERR_BAD_RESPONSE', config, {}, undefined)
    error.cause = new AggregateError([Object.assign(new Error('connect'), { code: 'ECONNREFUSED' })])

    expect(() => handleErrorResponse(error)).toThrow(ProxyConnectionError)
  })

  it('falls back to the generic error for non-connection failures', () => {
    process.env.https_proxy = 'http://localhost:1234'
    expect(() => handleErrorResponse(connectionError('ERR_BAD_RESPONSE')))
      .toThrow(MissingResponseError)
  })
})

describe('handleErrorResponse without a proxy', () => {
  it('reports the generic connection error', () => {
    try {
      handleErrorResponse(connectionError('ECONNREFUSED'))
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(MissingResponseError)
      expect(err).not.toBeInstanceOf(ProxyConnectionError)
    }
  })
})

function responseError (status: number, data: unknown): AxiosError {
  const config = { baseURL: 'https://api.checklyhq.com', url: '/next/checkly-storage/upload-code-bundle' } as
    InternalAxiosRequestConfig
  return new AxiosError('failed', 'ERR_BAD_REQUEST', config, {}, {
    status,
    statusText: 'error',
    headers: {},
    config,
    data,
  })
}

describe('handleErrorResponse for a 413 response', () => {
  it('maps the response to a PayloadTooLargeError preserving the server message', () => {
    try {
      handleErrorResponse(responseError(413, {
        statusCode: 413,
        error: 'Request Entity Too Large',
        message: 'Payload content length greater than maximum allowed: 31457280',
      }))
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(PayloadTooLargeError)
      expect((err as PayloadTooLargeError).data.message)
        .toBe('Payload content length greater than maximum allowed: 31457280')
    }
  })
})

describe('handleErrorResponse for a 403 response', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function forbidden (data: unknown): ForbiddenError {
    try {
      handleErrorResponse(responseError(403, data))
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError)
      return err as ForbiddenError
    }
    return expect.unreachable()
  }

  it('names the account and where it comes from when the credentials cannot access it', () => {
    vi.stubEnv('CHECKLY_API_KEY', 'cu_env')
    vi.stubEnv('CHECKLY_ACCOUNT_ID', 'acc-1')

    const err = forbidden({
      statusCode: 403,
      error: 'Forbidden',
      message: 'The selected account is not accessible with the provided credentials.',
      errorCode: 'ERR_ACCOUNT_NOT_ACCESSIBLE',
    })

    expect(err.message).toBe('Account "acc-1" from `CHECKLY_ACCOUNT_ID` is not available with `CHECKLY_API_KEY`. '
      + 'Fix them where they are set (the command line, your shell or .env).')
    expect(err.data.errorCode).toBe('ERR_ACCOUNT_NOT_ACCESSIBLE')
    expect(isAccountNotAccessible(err)).toBe(true)
  })

  it('keeps the message of a 403 without that code', () => {
    const err = forbidden({ statusCode: 403, error: 'Forbidden', message: 'Forbidden' })

    expect(err.message).toBe('Forbidden')
    expect(isAccountNotAccessible(err)).toBe(false)
  })
})
