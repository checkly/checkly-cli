import { Readable } from 'node:stream'
import { describe, it, expect, vi } from 'vitest'
import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { createRetryInterceptor, parseRetryAfter, RetryOptions } from '../retry.js'
import {
  handleErrorResponse,
  MiscellaneousError,
  RequestTimeoutError,
  ServerError,
  ValidationError,
} from '../errors.js'
import { api as productionApi } from '../api.js'

type Adapter = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>

function failWith (status: number, headers: Record<string, string> = {}): Adapter {
  return config => Promise.reject(new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_RESPONSE',
    config,
    {},
    {
      status,
      statusText: 'Error',
      headers,
      config,
      data: 'Upstream error',
    } as AxiosResponse,
  ))
}

function failWithCode (code: string): Adapter {
  return config => Promise.reject(new AxiosError('connection error', code, config))
}

function succeedWith (data: any): Adapter {
  return config => Promise.resolve({
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    data,
  })
}

// Mirrors the interceptor wiring of init() in api.ts: retry first (sees the
// raw AxiosError), error mapping second. A separate test below pins the
// production instance itself.
function createApi (options?: RetryOptions) {
  const adapter = vi.fn<Adapter>()
  const delays: number[] = []
  const api = axios.create({ adapter })
  api.interceptors.response.use(undefined, createRetryInterceptor(api, {
    sleep: ms => {
      delays.push(ms)
      return Promise.resolve()
    },
    random: () => 1,
    ...options,
  }))
  api.interceptors.response.use(
    response => response,
    error => handleErrorResponse(error),
  )
  return { api, adapter, delays }
}

describe('createRetryInterceptor', () => {
  it('retries a GET that received a 502 and returns the successful response', async () => {
    const { api, adapter } = createApi()
    adapter
      .mockImplementationOnce(failWith(502))
      .mockImplementationOnce(succeedWith({ ok: true }))

    const response = await api.get('/test')

    expect(response.data).toEqual({ ok: true })
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('gives up after 3 attempts and surfaces the mapped ServerError', async () => {
    const { api, adapter } = createApi()
    adapter.mockImplementation(failWith(502))

    await expect(api.get('/test')).rejects.toThrowError(ServerError)
    expect(adapter).toHaveBeenCalledTimes(3)
  })

  it('does not retry a POST by default', async () => {
    const { api, adapter } = createApi()
    adapter.mockImplementation(failWith(502))

    await expect(api.post('/test', { name: 'test' })).rejects.toThrowError(ServerError)
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('retries a POST that opted in with checklyRetry', async () => {
    const { api, adapter } = createApi()
    adapter
      .mockImplementationOnce(failWith(502))
      .mockImplementationOnce(succeedWith({ ok: true }))

    const response = await api.post('/test', { name: 'test' }, { checklyRetry: true })

    expect(response.data).toEqual({ ok: true })
    expect(adapter).toHaveBeenCalledTimes(2)
    // The replay re-runs the (idempotent) default JSON transform over the
    // already-serialized body; the bytes on the wire must not change.
    expect(adapter.mock.calls[1][0].data).toBe(adapter.mock.calls[0][0].data)
  })

  it('does not retry a 400', async () => {
    const { api, adapter } = createApi()
    adapter.mockImplementation(failWith(400))

    await expect(api.get('/test')).rejects.toThrowError(ValidationError)
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('does not retry a 408 (long-poll callers own that cadence)', async () => {
    const { api, adapter } = createApi()
    adapter.mockImplementation(failWith(408))

    await expect(api.get('/test')).rejects.toThrowError(RequestTimeoutError)
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('honors Retry-After on a 429', async () => {
    const { api, adapter, delays } = createApi()
    adapter
      .mockImplementationOnce(failWith(429, { 'retry-after': '1' }))
      .mockImplementationOnce(succeedWith({ ok: true }))

    await api.get('/test')

    expect(delays).toEqual([1000])
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 429 whose Retry-After exceeds the delay cap', async () => {
    const { api, adapter } = createApi()
    adapter.mockImplementation(failWith(429, { 'retry-after': '30' }))

    await expect(api.get('/test')).rejects.toThrowError(MiscellaneousError)
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('retries a 503 whose Retry-After exceeds the delay cap using backoff instead', async () => {
    const { api, adapter, delays } = createApi()
    adapter
      .mockImplementationOnce(failWith(503, { 'retry-after': '30' }))
      .mockImplementationOnce(succeedWith({ ok: true }))

    await api.get('/test')

    expect(delays).toEqual([250])
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('does not retry stream responses', async () => {
    const { api, adapter } = createApi()
    adapter.mockImplementation(failWith(502))

    await expect(api.get('/test', { responseType: 'stream' })).rejects.toThrowError(ServerError)
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('does not retry a stream request body even when opted in', async () => {
    const { api, adapter } = createApi()
    adapter.mockImplementation(failWith(502))

    const body = Readable.from(['payload'])
    await expect(api.post('/test', body, { checklyRetry: true })).rejects.toThrowError(ServerError)
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('does not retry a request that was canceled', async () => {
    const { api, adapter } = createApi()
    adapter.mockImplementation(failWithCode('ERR_CANCELED'))

    await expect(api.get('/test')).rejects.toThrow()
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('does not retry when the signal aborts during the backoff sleep', async () => {
    const controller = new AbortController()
    const { api, adapter } = createApi({
      sleep: () => {
        controller.abort()
        return Promise.resolve()
      },
    })
    adapter.mockImplementation(failWith(502))

    await expect(api.get('/test', { signal: controller.signal })).rejects.toThrowError(ServerError)
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('stops sleeping as soon as the signal aborts', async () => {
    const controller = new AbortController()
    // A sleep that never resolves: only the abort can end the backoff wait.
    const { api, adapter } = createApi({ sleep: () => new Promise<void>(() => {}) })
    adapter.mockImplementation(failWith(502))

    const request = api.get('/test', { signal: controller.signal })
    const assertion = expect(request).rejects.toThrowError(ServerError)
    await new Promise(resolve => setTimeout(resolve, 10))
    controller.abort()

    await assertion
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('retries connection-level errors with no response', async () => {
    const { api, adapter } = createApi()
    adapter
      .mockImplementationOnce(failWithCode('ECONNRESET'))
      .mockImplementationOnce(succeedWith({ ok: true }))

    const response = await api.get('/test')

    expect(response.data).toEqual({ ok: true })
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('backs off exponentially up to the per-delay cap', async () => {
    const { api, adapter, delays } = createApi({ baseDelayMs: 1500 })
    adapter.mockImplementation(failWith(502))

    await expect(api.get('/test')).rejects.toThrowError(ServerError)
    expect(delays).toEqual([1500, 2000])
  })

  it('re-runs request interceptors on each retry', async () => {
    const { api, adapter } = createApi()
    let requestCount = 0
    api.interceptors.request.use(config => {
      requestCount += 1
      config.headers['x-request-count'] = String(requestCount)
      return config
    })
    adapter
      .mockImplementationOnce(failWith(502))
      .mockImplementationOnce(succeedWith({ ok: true }))

    await api.get('/test')

    expect(adapter.mock.calls[0][0].headers['x-request-count']).toBe('1')
    expect(adapter.mock.calls[1][0].headers['x-request-count']).toBe('2')
  })
})

describe('parseRetryAfter', () => {
  it('parses delay-seconds', () => {
    expect(parseRetryAfter('2')).toBe(2000)
    expect(parseRetryAfter('0')).toBe(0)
  })

  it('parses an HTTP-date relative to now', () => {
    const value = parseRetryAfter(new Date(Date.now() + 5000).toUTCString())
    expect(value).toBeGreaterThan(3000)
    expect(value).toBeLessThanOrEqual(5000)
  })

  it('returns 0 for an HTTP-date in the past', () => {
    expect(parseRetryAfter(new Date(Date.now() - 5000).toUTCString())).toBe(0)
  })

  it('returns undefined for absent or malformed values', () => {
    expect(parseRetryAfter(undefined)).toBeUndefined()
    expect(parseRetryAfter('')).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
    expect(parseRetryAfter('-1')).toBeUndefined()
  })
})

describe('production api instance', () => {
  it('is wired to retry before mapping errors', async () => {
    const adapter = vi.fn<Adapter>(failWith(502))

    // The per-request adapter leaves the shared instance untouched for other
    // tests. Uses real (jittered) backoff delays: worst case ~750ms.
    await expect(productionApi.get('/test', { adapter })).rejects.toThrowError(ServerError)
    expect(adapter).toHaveBeenCalledTimes(3)
  })
})
