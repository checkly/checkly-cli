import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import Usage from '../usage.js'

function client () {
  const adapter = vi.fn((config: InternalAxiosRequestConfig) => Promise.resolve({
    data: { server: 'payload' }, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config,
  }))
  return { adapter, usage: new Usage(axios.create({ adapter })) }
}

describe('Usage REST client', () => {
  it('lists v2 terms with overlap bounds and cursor pagination', async () => {
    const { adapter, usage } = client()
    const result = await usage.listTerms({ from: '2026-01-01', to: '2026-12-31', limit: 25, nextId: 'opaque' })
    expect(adapter.mock.calls[0][0]).toMatchObject({
      url: '/v2/usage/terms', params: { from: '2026-01-01', to: '2026-12-31', limit: 25, nextId: 'opaque' },
    })
    expect(result.data).toEqual({ server: 'payload' })
  })

  it('leaves terms date bounds unset when omitted', async () => {
    const { adapter, usage } = client()
    await usage.listTerms()
    expect(adapter.mock.calls[0][0]).toMatchObject({ url: '/v2/usage/terms', params: {} })
  })

  it('encodes the term path segment for detail and projections', async () => {
    const { adapter, usage } = client()
    await usage.getTerm('id/with space')
    await usage.getProjections('id/with space', { asOf: '2026-03-31' })
    expect(adapter.mock.calls[0][0].url).toBe('/v2/usage/terms/id%2Fwith%20space')
    expect(adapter.mock.calls[1][0]).toMatchObject({
      url: '/v2/usage/terms/id%2Fwith%20space/projections', params: { asOf: '2026-03-31' },
    })
  })

  it('leaves the projection default with the server', async () => {
    const { adapter, usage } = client()
    await usage.getProjections('term')
    expect(adapter.mock.calls[0][0]).toMatchObject({ url: '/v2/usage/terms/term/projections', params: {} })
  })

  it('comma-joins all report selections without introducing checkTypes', async () => {
    const { adapter, usage } = client()
    await usage.getSummary({
      from: '2026-01-01', to: '2026-01-31', usageTermsIds: ['term-a', 'term-b'],
      accountIds: ['account-a', 'account-b'], pricingRuleKeys: ['apiChecks', 'aiInvocations'],
    })
    expect(adapter.mock.calls[0][0]).toMatchObject({ url: '/v2/usage/summary', params: {
      from: '2026-01-01', to: '2026-01-31', usageTermsIds: 'term-a,term-b',
      accountIds: 'account-a,account-b', pricingRuleKeys: 'apiChecks,aiInvocations',
    } })
  })

  it('serializes composable grouping, includes, and pagination for series', async () => {
    const { adapter, usage } = client()
    await usage.getSeries({ interval: 'month', groupBy: ['usageTerm', 'pricingRule', 'checkType'],
      include: ['runs', 'calculations'], limit: 50, nextId: 'cursor-1' })
    expect(adapter.mock.calls[0][0]).toMatchObject({ url: '/v2/usage/series', params: {
      interval: 'month', groupBy: 'usageTerm,pricingRule,checkType',
      include: 'runs,calculations', limit: 50, nextId: 'cursor-1',
    } })
  })

  it('drops empty lists so the backend can produce ungrouped default reports', async () => {
    const { adapter, usage } = client()
    await usage.getSeries({ usageTermsIds: [], accountIds: [], pricingRuleKeys: [], groupBy: [], include: [] })
    expect(adapter.mock.calls[0][0]).toMatchObject({ url: '/v2/usage/series', params: {} })
  })
})
