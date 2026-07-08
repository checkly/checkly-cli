import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import CheckResults from '../check-results.js'

function makeAxiosMock (): AxiosInstance {
  return {
    get: vi.fn().mockResolvedValue({ data: { entries: [], nextId: null, length: 0 } }),
  } as unknown as AxiosInstance
}

describe('CheckResults.getAll()', () => {
  let api: AxiosInstance
  let checkResults: CheckResults

  beforeEach(() => {
    api = makeAxiosMock()
    checkResults = new CheckResults(api)
  })

  it('serializes the fields array as a comma-separated query string', async () => {
    await checkResults.getAll('check-1', { limit: 10, fields: ['id', 'startedAt', 'responseTime'] })

    expect(api.get).toHaveBeenCalledWith('/v2/check-results/check-1', {
      params: { limit: 10, fields: 'id,startedAt,responseTime' },
    })
  })

  it('does not send a fields param when fields is omitted', async () => {
    await checkResults.getAll('check-1', { limit: 5 })

    const [, config] = vi.mocked(api.get).mock.calls[0]
    expect((config as any).params.fields).toBeUndefined()
  })

  it('passes other params through untouched', async () => {
    await checkResults.getAll('check-1', { from: 100, to: 200, resultType: 'ALL', nextId: 'cursor' })

    const [, config] = vi.mocked(api.get).mock.calls[0]
    expect((config as any).params).toMatchObject({ from: 100, to: 200, resultType: 'ALL', nextId: 'cursor' })
  })
})
