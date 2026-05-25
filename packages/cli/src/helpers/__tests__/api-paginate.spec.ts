import { describe, it, expect, vi } from 'vitest'
import { paginateAll } from '../api-paginate.js'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

function mockResponse (data: unknown, headers: Record<string, string> = {}): AxiosResponse {
  return {
    data,
    headers,
    status: 200,
    statusText: 'OK',
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
  })

  describe('unrecognized response', () => {
    it('returns data as-is and warns on stderr', async () => {
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
