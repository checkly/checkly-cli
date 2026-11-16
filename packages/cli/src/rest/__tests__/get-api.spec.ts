import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { accounts, getApi } from '../api.js'

describe('getApi', () => {
  const api = getApi()
  const originalAdapter = api.defaults.adapter

  afterEach(() => {
    api.defaults.adapter = originalAdapter
    delete api.defaults.headers.common['x-test-default']
  })

  it('returns the same instance on every call', () => {
    expect(getApi()).toBe(api)
  })

  it('sends defaults set on the instance with requests made through the resources', async () => {
    // Commands set defaults such as the CLI version header on getApi() and
    // rely on every resource reaching the same instance.
    const adapter = vi.fn<AxiosAdapter>((config: InternalAxiosRequestConfig) => Promise.resolve({
      data: [], status: 200, statusText: 'OK', headers: {}, config,
    } as AxiosResponse))
    api.defaults.adapter = adapter
    getApi().defaults.headers.common['x-test-default'] = 'set'

    await accounts.getAll()

    expect(adapter).toHaveBeenCalledTimes(1)
    expect(adapter.mock.calls[0][0].headers['x-test-default']).toBe('set')
  })
})
