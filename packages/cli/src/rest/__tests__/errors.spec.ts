import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { handleErrorResponse, MissingResponseError, ProxyConnectionError } from '../errors.js'

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
