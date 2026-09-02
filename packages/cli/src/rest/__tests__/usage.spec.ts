import { describe, expect, it, vi } from 'vitest'
import Usage from '../usage.js'

function createApi () {
  return { get: vi.fn().mockResolvedValue({ data: {} }) }
}

describe('Usage REST client', () => {
  it('requests usage terms without query params when none are given', async () => {
    const api = createApi()

    await new Usage(api as any).getTerms()

    expect(api.get).toHaveBeenCalledWith('/v1/usage/terms', { params: {} })
  })

  it('passes usageTermsId and to when requesting usage terms', async () => {
    const api = createApi()

    await new Usage(api as any).getTerms({ usageTermsId: 'terms-1', to: '2026-01-31' })

    expect(api.get).toHaveBeenCalledWith('/v1/usage/terms', {
      params: { usageTermsId: 'terms-1', to: '2026-01-31' },
    })
  })

  it('comma-joins account and check type filters for the summary', async () => {
    const api = createApi()

    await new Usage(api as any).getSummary({
      from: '2026-01-01',
      to: '2026-01-31',
      accountIds: ['acc-a', 'acc-b'],
      checkTypes: ['API', 'BROWSER'],
    })

    expect(api.get).toHaveBeenCalledWith('/v1/usage/summary', {
      params: { from: '2026-01-01', to: '2026-01-31', accountIds: 'acc-a,acc-b', checkTypes: 'API,BROWSER' },
    })
  })

  it('drops empty filter arrays and undefined values', async () => {
    const api = createApi()

    await new Usage(api as any).getSummary({ accountIds: [], checkTypes: undefined, from: undefined })

    expect(api.get).toHaveBeenCalledWith('/v1/usage/summary', { params: {} })
  })

  it('passes series grouping and pagination params', async () => {
    const api = createApi()

    await new Usage(api as any).getSeries({
      interval: 'month',
      groupBy: 'account',
      limit: 50,
      nextId: 'cursor-1',
    })

    expect(api.get).toHaveBeenCalledWith('/v1/usage/series', {
      params: { interval: 'month', groupBy: 'account', limit: 50, nextId: 'cursor-1' },
    })
  })
})
