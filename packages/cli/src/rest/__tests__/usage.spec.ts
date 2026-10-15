import { once } from 'node:events'
import { createServer } from 'node:http'
import axios from 'axios'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Usage from '../usage.js'

interface Request {
  method: string | undefined
  path: string
  params: Record<string, string>
}

const requests: Request[] = []
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  requests.push({ method: request.method, path: url.pathname, params: Object.fromEntries(url.searchParams) })
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end('{}')
})
let usage: Usage

beforeAll(async () => {
  const listening = once(server, 'listening')
  server.listen(0, '127.0.0.1')
  await listening
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected a local TCP listener')
  usage = new Usage(axios.create({ baseURL: `http://127.0.0.1:${address.port}`, proxy: false }))
})
beforeEach(() => {
  requests.length = 0
})
afterAll(async () => {
  if (!server.listening) return
  const closed = once(server, 'close')
  server.close()
  await closed
})

describe('Usage REST client', () => {
  it('lists v2 terms with overlap bounds and an opaque cursor', async () => {
    await usage.listTerms({ from: '2026-01-01', to: '2026-12-31', limit: 25, nextId: 'cursor/+?=& space' })
    expect(requests).toEqual([{
      method: 'GET', path: '/v2/usage/terms', params: {
        from: '2026-01-01', to: '2026-12-31', limit: '25', nextId: 'cursor/+?=& space',
      },
    }])
  })

  it('leaves terms date bounds unset when omitted', async () => {
    await usage.listTerms()
    expect(requests).toEqual([{ method: 'GET', path: '/v2/usage/terms', params: {} }])
  })

  it('encodes the term path segment for detail and projections', async () => {
    await usage.getTerm('id/with space')
    await usage.getProjections('id/with space', { asOf: '2026-03-31' })
    expect(requests).toEqual([
      { method: 'GET', path: '/v2/usage/terms/id%2Fwith%20space', params: {} },
      { method: 'GET', path: '/v2/usage/terms/id%2Fwith%20space/projections', params: { asOf: '2026-03-31' } },
    ])
  })

  it('leaves the projection default with the server', async () => {
    await usage.getProjections('term')
    expect(requests).toEqual([{ method: 'GET', path: '/v2/usage/terms/term/projections', params: {} }])
  })

  it('comma-joins all report selections without extra query parameters', async () => {
    await usage.getSummary({
      from: '2026-01-01', to: '2026-01-31', usageTermsIds: ['term-a', 'term-b'],
      accountIds: ['account-a', 'account-b'], pricingRuleKeys: ['apiChecks', 'aiInvocations'],
    })
    expect(requests).toEqual([{
      method: 'GET', path: '/v2/usage/summary', params: {
        from: '2026-01-01', to: '2026-01-31', usageTermsIds: 'term-a,term-b',
        accountIds: 'account-a,account-b', pricingRuleKeys: 'apiChecks,aiInvocations',
      },
    }])
  })

  it('serializes composable grouping, includes, and pagination for series', async () => {
    await usage.getSeries({ interval: 'month', groupBy: ['usageTerm', 'pricingRule', 'checkType'],
      include: ['runs', 'calculations'], limit: 50, nextId: 'cursor-1' })
    expect(requests).toEqual([{
      method: 'GET', path: '/v2/usage/series', params: {
        interval: 'month', groupBy: 'usageTerm,pricingRule,checkType',
        include: 'runs,calculations', limit: '50', nextId: 'cursor-1',
      },
    }])
  })

  it('omits empty report selections from the query', async () => {
    await usage.getSeries({ usageTermsIds: [], accountIds: [], pricingRuleKeys: [], groupBy: [], include: [] })
    expect(requests).toEqual([{ method: 'GET', path: '/v2/usage/series', params: {} }])
  })
})
