import { describe, it, expect, vi } from 'vitest'
import { paginateAll } from '../api-paginate.js'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

function mockResponse (data: unknown, headers: Record<string, string> = {}, status = 200): AxiosResponse {
  return {
    data,
    headers,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    config: {} as any,
  }
}

function mockAxios (responses: AxiosResponse[]): AxiosInstance {
  let callIndex = 0
  return {
    request: vi.fn(() => Promise.resolve(responses[callIndex++])),
  } as unknown as AxiosInstance
}

describe('paginateAll', () => {
  describe('Content-Range pagination', () => {
    it('fetches all pages when total exceeds first page', async () => {
      const page1 = mockResponse([{ id: 1 }, { id: 2 }], { 'content-range': '0-1/4' })
      const page2 = mockResponse([{ id: 3 }, { id: 4 }])
      const client = mockAxios([page2])
      const config: AxiosRequestConfig = { method: 'GET', url: '/v1/things' }

      const result = await paginateAll(client, config, page1)

      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
      expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
        params: { page: 2, limit: 2 },
      }))
    })

    it('returns single page when total fits', async () => {
      const page1 = mockResponse([{ id: 1 }], { 'content-range': '0-0/1' })
      const client = mockAxios([])
      const config: AxiosRequestConfig = { method: 'GET', url: '/v1/things' }

      const result = await paginateAll(client, config, page1)

      expect(result).toEqual([{ id: 1 }])
      expect(client.request).not.toHaveBeenCalled()
    })

    it('throws on follow-up page error', async () => {
      const page1 = mockResponse([{ id: 1 }], { 'content-range': '0-0/2' })
      const page2 = mockResponse({ message: 'Server Error' }, {}, 500)
      const client = mockAxios([page2])
      const config: AxiosRequestConfig = { method: 'GET', url: '/v1/things' }

      await expect(paginateAll(client, config, page1)).rejects.toThrow('Pagination failed on page 2: HTTP 500')
    })
  })

  describe('cursor pagination', () => {
    it('follows nextId until null', async () => {
      const page1 = mockResponse({ entries: [{ id: 1 }], nextId: 'cursor-2' })
      const page2Resp = mockResponse({ entries: [{ id: 2 }], nextId: null })
      const client = mockAxios([page2Resp])
      const config: AxiosRequestConfig = { method: 'GET', url: '/v1/things' }

      const result = await paginateAll(client, config, page1)

      expect(result).toEqual([{ id: 1 }, { id: 2 }])
      expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
        params: { nextId: 'cursor-2' },
      }))
    })

    it('returns single page when nextId is null', async () => {
      const page1 = mockResponse({ entries: [{ id: 1 }], nextId: null })
      const client = mockAxios([])
      const config: AxiosRequestConfig = { method: 'GET', url: '/v1/things' }

      const result = await paginateAll(client, config, page1)

      expect(result).toEqual([{ id: 1 }])
      expect(client.request).not.toHaveBeenCalled()
    })

    it('throws on follow-up page error', async () => {
      const page1 = mockResponse({ entries: [{ id: 1 }], nextId: 'cursor-2' })
      const page2 = mockResponse({ message: 'Server Error' }, {}, 500)
      const client = mockAxios([page2])
      const config: AxiosRequestConfig = { method: 'GET', url: '/v1/things' }

      await expect(paginateAll(client, config, page1)).rejects.toThrow('Pagination failed: HTTP 500')
    })
  })

  describe('non-array entries detection', () => {
    it('falls through to unrecognized when entries is not an array', async () => {
      const logger = { warn: vi.fn() }
      const page1 = mockResponse({ entries: 'not-an-array', nextId: 'cursor' })
      const client = mockAxios([])
      const config: AxiosRequestConfig = { method: 'GET', url: '/v1/things' }

      const result = await paginateAll(client, config, page1, logger)

      expect(result).toEqual({ entries: 'not-an-array', nextId: 'cursor' })
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('--paginate had no effect'))
    })
  })

  describe('unrecognized response', () => {
    it('returns data as-is and warns via logger', async () => {
      const logger = { warn: vi.fn() }
      const page1 = mockResponse({ foo: 'bar' })
      const client = mockAxios([])
      const config: AxiosRequestConfig = { method: 'GET', url: '/v1/things' }

      const result = await paginateAll(client, config, page1, logger)

      expect(result).toEqual({ foo: 'bar' })
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('--paginate had no effect'))
    })

    it('falls back to stderr when no logger provided', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      const page1 = mockResponse({ foo: 'bar' })
      const client = mockAxios([])
      const config: AxiosRequestConfig = { method: 'GET', url: '/v1/things' }

      const result = await paginateAll(client, config, page1)

      expect(result).toEqual({ foo: 'bar' })
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('--paginate had no effect'))
      stderrSpy.mockRestore()
    })
  })
})
