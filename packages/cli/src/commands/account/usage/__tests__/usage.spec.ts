import { execFileSync } from 'node:child_process'
import { Parser } from '@oclif/core'
import { AxiosHeaders, type AxiosResponse } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../rest/api', () => ({
  usage: { listTerms: vi.fn(), getTerm: vi.fn(), getSummary: vi.fn(), getSeries: vi.fn(), getProjections: vi.fn() },
}))
import * as api from '../../../../rest/api.js'
import { ForbiddenError, MiscellaneousError, NotFoundError } from '../../../../rest/errors.js'
import { loadUsageNames } from '../../../../helpers/usage.js'
import { stripAnsi } from '../../../../formatters/render.js'
import {
  ACCOUNT_ID, projectionsFixture, renewalFixture, RENEWAL_ID, seriesFixture,
  summaryFixture, termFixture, TERM_ID,
} from '../../../../formatters/__tests__/__fixtures__/usage-fixtures.js'
import UsageTermsCommand from '../terms.js'
import UsageTermCommand from '../term.js'
import UsageSummaryCommand from '../summary.js'
import UsageSeriesCommand from '../series.js'
import UsageProjectionsCommand from '../projections.js'
import { createCommandContext } from '../../../__tests__/helpers/command-context.js'

function response<T> (data: T): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } }
}

function context (parsed: Record<string, unknown>) {
  const ctx = createCommandContext({ parsed, style: { outputFormat: '' } })
  ctx.log.mockImplementation((message: string) => ctx.logged.push(stripAnsi(message)))
  return ctx
}

function expectHintArguments (output: string, label: string, expected: string[]) {
  const line = output.split('\n').map(value => value.trim()).find(value => value.startsWith(`${label}:`)) ?? ''
  expect(line).toContain('checkly account usage')
  if (process.platform === 'win32') return
  const command = line.slice(line.indexOf(':') + 1).trim().replace(/^(`+)(.*)\1$/, '$2')
  const recovered = execFileSync('/bin/sh', ['-c', `set -- ${command}; printf '%s\\0' "$@"`], {
    encoding: 'utf8',
  }).split('\0').slice(0, -1)
  expect(recovered).toEqual(expected)
}

const seriesFlags = { 'interval': 'day', 'group-by': 'account,checkType', 'limit': 100, 'output': 'table' }
const originalColumns = process.stdout.columns
beforeEach(() => {
  vi.resetAllMocks()
  process.exitCode = undefined
  Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 1000 })
  vi.mocked(api.usage.listTerms).mockResolvedValue(response({ data: [termFixture, renewalFixture], nextId: null }))
  vi.mocked(api.usage.getTerm).mockImplementation(id => Promise.resolve(response(
    id === RENEWAL_ID ? renewalFixture : termFixture,
  )))
  vi.mocked(api.usage.getSummary).mockResolvedValue(response(summaryFixture))
  vi.mocked(api.usage.getSeries).mockResolvedValue(response(seriesFixture))
  vi.mocked(api.usage.getProjections).mockResolvedValue(response(projectionsFixture))
})
afterEach(() => {
  process.exitCode = undefined
  Object.defineProperty(process.stdout, 'columns', { configurable: true, value: originalColumns })
})

describe('usage terms commands', () => {
  it('prints the list JSON envelope with supplied bounds and pagination', async () => {
    vi.mocked(api.usage.listTerms).mockResolvedValue(response({ data: [termFixture], nextId: 'terms-next' }))
    const ctx = context({ flags: { from: '2026-01-01', to: '2026-12-31', limit: 25,
      cursor: 'previous', output: 'json' } })
    await Reflect.apply(UsageTermsCommand.prototype.run, ctx, [])
    expect(api.usage.listTerms).toHaveBeenCalledWith({
      from: '2026-01-01', to: '2026-12-31', limit: 25, nextId: 'previous',
    })
    expect(JSON.parse(ctx.logged[0])).toEqual({
      data: [termFixture], pagination: { nextId: 'terms-next', length: 1 },
    })
    expect(api.usage.getTerm).not.toHaveBeenCalled()
  })

  it('renders an empty list and still provides a shell-safe continuation', async () => {
    vi.mocked(api.usage.listTerms).mockResolvedValue(response({ data: [], nextId: 'cursor\'with spaces' }))
    const ctx = context({ flags: { limit: 100, output: 'md', from: '2026-01-01' } })
    await Reflect.apply(UsageTermsCommand.prototype.run, ctx, [])
    expect(ctx.logged[0]).toContain('No usage terms found.')
    expectHintArguments(ctx.logged[0], 'Next page', [
      'checkly', 'account', 'usage', 'terms', '--from', '2026-01-01', '--limit', '100',
      '--output', 'md', '--cursor', 'cursor\'with spaces',
    ])
    expect(ctx.logged[0]).not.toContain('--to')
  })

  it('prints one term resource without transforming its JSON', async () => {
    const ctx = context({ args: { id: TERM_ID }, flags: { output: 'json' } })
    await Reflect.apply(UsageTermCommand.prototype.run, ctx, [])
    expect(api.usage.getTerm).toHaveBeenCalledExactlyOnceWith(TERM_ID)
    expect(JSON.parse(ctx.logged[0])).toEqual(termFixture)
    expect(api.usage.listTerms).not.toHaveBeenCalled()
  })

  it('renders detail pricing and accounts for human output', async () => {
    const ctx = context({ args: { id: TERM_ID }, flags: { output: 'detail' } })
    await Reflect.apply(UsageTermCommand.prototype.run, ctx, [])
    expect(ctx.logged[0]).toContain('Usage term: Acme Corp')
    expect(ctx.logged[0]).toContain('Acme Production')
    expect(ctx.logged[0]).toContain('capacity_blocks_per_period')
  })

  it('rejects invalid paths locally and distinguishes a missing requested term', async () => {
    const bad = context({ args: { id: '../term' }, flags: { output: 'json' } })
    await Reflect.apply(UsageTermCommand.prototype.run, bad, [])
    expect(api.usage.getTerm).not.toHaveBeenCalled()
    expect(bad.style.longError).toHaveBeenCalledWith('Failed to load usage term.',
      expect.objectContaining({ message: 'Usage term ID must be a valid UUID.' }))
    expect(process.exitCode).toBe(2)
    vi.mocked(api.usage.getTerm).mockRejectedValue(new NotFoundError({
      statusCode: 404, error: 'Not Found', message: 'No usage terms found', code: 'NO_USAGE_TERMS',
    }))
    const missing = context({ args: { id: TERM_ID }, flags: { output: 'json' } })
    await Reflect.apply(UsageTermCommand.prototype.run, missing, [])
    expect(missing.style.longError).toHaveBeenCalledWith('Failed to load usage term.',
      `Usage term ${TERM_ID} was not found. Run "checkly account usage terms" to discover available term IDs.`)
  })
})

describe('usage summary', () => {
  it('prints the raw multi-term resource and never fetches display metadata for JSON', async () => {
    const ctx = context({ flags: { 'output': 'json', 'usage-terms-id': [TERM_ID, RENEWAL_ID],
      'account-id': [ACCOUNT_ID], 'pricing-rule': ['apiChecks'] } })
    await Reflect.apply(UsageSummaryCommand.prototype.run, ctx, [])
    expect(JSON.parse(ctx.logged[0])).toEqual(summaryFixture)
    expect(api.usage.getSummary).toHaveBeenCalledWith({ from: undefined, to: undefined,
      usageTermsIds: [TERM_ID, RENEWAL_ID], accountIds: [ACCOUNT_ID], pricingRuleKeys: ['apiChecks'] })
    expect(api.usage.getTerm).not.toHaveBeenCalled()
    expect(api.usage.listTerms).not.toHaveBeenCalled()
  })

  it('renders compact breakdown IDs and preserves filters and effective dates in the daily hint', async () => {
    const ctx = context({ flags: { 'output': 'detail', 'usage-terms-id': [TERM_ID, RENEWAL_ID],
      'account-id': [ACCOUNT_ID], 'pricing-rule': ['apiChecks'] } })
    await Reflect.apply(UsageSummaryCommand.prototype.run, ctx, [])
    expect(ctx.logged[0]).toContain(RENEWAL_ID)
    expectHintArguments(ctx.logged[0], 'Daily series', [
      'checkly', 'account', 'usage', 'series', '--from', '2026-06-30', '--to', '2026-07-02',
      '--interval', 'day', '--group-by', 'account,checkType', '--usage-terms-id', TERM_ID,
      '--usage-terms-id', RENEWAL_ID, '--account-id', ACCOUNT_ID, '--pricing-rule', 'apiChecks',
    ])
  })

  it('keeps empty breakdown and gaps visible without fetching term names', async () => {
    vi.mocked(api.usage.getSummary).mockResolvedValue(response({ ...summaryFixture, breakdown: [] }))
    const ctx = context({ flags: { output: 'md' } })
    await Reflect.apply(UsageSummaryCommand.prototype.run, ctx, [])
    expect(ctx.logged[0]).toContain('Coverage gaps (credits unavailable)')
    expect(ctx.logged[0]).toContain('2026-07-01')
    expect(api.usage.getTerm).not.toHaveBeenCalled()
  })
  it('prints compact summary credits and pricing breakdown without metadata requests', async () => {
    vi.mocked(api.usage.listTerms).mockRejectedValue(new Error('Name discovery unavailable'))
    vi.mocked(api.usage.getTerm).mockRejectedValue(new Error('Name detail unavailable'))
    const ctx = context({ flags: { output: 'md' } })
    await Reflect.apply(UsageSummaryCommand.prototype.run, ctx, [])
    expect(ctx.logged[0]).toContain('0.6047')
    expect(ctx.logged[0]).toContain('apiChecks')
    expect(ctx.logged[0]).not.toContain('4,900')
    expect(ctx.logged[0]).toContain(TERM_ID)
    expect(api.usage.getSummary).toHaveBeenCalledTimes(1)
    expect(api.usage.listTerms).not.toHaveBeenCalled()
    expect(api.usage.getTerm).not.toHaveBeenCalled()
    expect(ctx.style.longError).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })
})

describe('usage series', () => {
  it('starts a Markdown report before coverage and the series table', async () => {
    vi.mocked(api.usage.getSeries).mockResolvedValue(response({ ...seriesFixture,
      coverage: { gaps: [{ from: '2026-07-01', to: '2026-07-01' }] } }))
    const ctx = context({ flags: { ...seriesFlags, output: 'md', include: ['calculations'] } })
    await Reflect.apply(UsageSeriesCommand.prototype.run, ctx, [])
    expect(ctx.logged[0]).toMatch(/^# Usage series\n\n## Coverage gaps/)
    expect(ctx.logged[0].match(/^#{1,2} .+$/gm)).toEqual([
      '# Usage series', '## Coverage gaps (credits unavailable)', '## Usage rows',
      '## Row 1 calculations (2026-07-02 to 2026-07-02)',
    ])
    expect(ctx.logged[0]).toContain('## Usage rows\n\n| Period |')
    expect(ctx.logged[0].indexOf('## Coverage gaps')).toBeLessThan(ctx.logged[0].indexOf('## Usage rows'))
  })

  it('prints the stable JSON envelope with all v2 report metadata and no display lookups', async () => {
    const ctx = context({ flags: { ...seriesFlags, output: 'json', include: ['runs', 'calculations'] } })
    await Reflect.apply(UsageSeriesCommand.prototype.run, ctx, [])
    expect(JSON.parse(ctx.logged[0])).toEqual({
      data: seriesFixture.data, pagination: { nextId: 'opaque cursor', length: 1 },
      period: { from: '2026-07-02', to: '2026-07-03' }, usageTermsIds: [RENEWAL_ID],
      interval: 'day', groupBy: ['account', 'usageTerm', 'pricingRule', 'checkType'], coverage: { gaps: [] },
    })
    expect(api.usage.getTerm).not.toHaveBeenCalled()
    expect(api.usage.listTerms).not.toHaveBeenCalled()
  })

  it('loads report names across discovery pages and pins every continuation flag', async () => {
    vi.mocked(api.usage.listTerms)
      .mockResolvedValueOnce(response({ data: [termFixture], nextId: 'name-page-2' }))
      .mockResolvedValueOnce(response({ data: [renewalFixture], nextId: null }))
    const ctx = context({ flags: { ...seriesFlags, 'usage-terms-id': [RENEWAL_ID],
      'account-id': [ACCOUNT_ID], 'pricing-rule': ['apiChecks'], 'include': ['runs', 'calculations'],
      'cursor': 'old-cursor' } })
    await Reflect.apply(UsageSeriesCommand.prototype.run, ctx, [])
    expect(api.usage.listTerms).toHaveBeenCalledWith({ from: '2026-07-02', to: '2026-07-03', limit: 500, nextId: 'name-page-2' })
    expect(api.usage.getTerm).not.toHaveBeenCalled()
    const output = ctx.logged[0]
    expect(output).toContain('Acme Renewal')
    expect(output).toContain('Acme Production')
    expectHintArguments(output, 'Next page', [
      'checkly', 'account', 'usage', 'series', '--from', '2026-07-02', '--to', '2026-07-03',
      '--limit', '100', '--interval', 'day', '--group-by', 'account,usageTerm,pricingRule,checkType',
      '--usage-terms-id', RENEWAL_ID, '--account-id', ACCOUNT_ID, '--pricing-rule', 'apiChecks',
      '--include', 'runs,calculations', '--cursor', 'opaque cursor',
    ])
    expect(output).not.toContain('old-cursor')
  })

  it('keeps gap and cursor output for empty pages and omits display lookups', async () => {
    vi.mocked(api.usage.getSeries).mockResolvedValue(response({ ...seriesFixture, data: [],
      coverage: { gaps: [{ from: '2026-07-01', to: '2026-07-01' }] } }))
    const ctx = context({ flags: { ...seriesFlags, output: 'md' } })
    await Reflect.apply(UsageSeriesCommand.prototype.run, ctx, [])
    expect(ctx.logged[0]).toContain('Coverage gaps (credits unavailable)')
    expect(ctx.logged[0]).toContain('No usage rows found for the requested range.')
    expectHintArguments(ctx.logged[0], 'Next page', [
      'checkly', 'account', 'usage', 'series', '--from', '2026-07-02', '--to', '2026-07-03',
      '--limit', '100', '--interval', 'day', '--group-by', 'account,usageTerm,pricingRule,checkType',
      '--output', 'md', '--cursor', 'opaque cursor',
    ])
    expect(api.usage.getTerm).not.toHaveBeenCalled()
  })

  it('does not fetch names for unrelated grouping and preserves explicit ungrouped continuation', async () => {
    vi.mocked(api.usage.getSeries).mockResolvedValue(response({ ...seriesFixture, groupBy: [] }))
    const ctx = context({ flags: { ...seriesFlags, 'group-by': 'none' } })
    await Reflect.apply(UsageSeriesCommand.prototype.run, ctx, [])
    expect(api.usage.getSeries).toHaveBeenCalledWith(expect.objectContaining({ groupBy: [] }))
    expectHintArguments(ctx.logged[0], 'Next page', [
      'checkly', 'account', 'usage', 'series', '--from', '2026-07-02', '--to', '2026-07-03',
      '--limit', '100', '--interval', 'day', '--group-by', 'none', '--cursor', 'opaque cursor',
    ])
    expect(api.usage.getTerm).not.toHaveBeenCalled()
  })

  it.each([
    new MiscellaneousError({ statusCode: 429, error: 'Too Many Requests', message: 'Rate limited' }),
    new NotFoundError({ statusCode: 404, error: 'Not Found', message: 'Term lookup unavailable' }),
    new Error('Connection reset'),
  ])('retains the loaded report and raw IDs when name enrichment fails: %s', async error => {
    vi.mocked(api.usage.listTerms).mockRejectedValue(error)
    vi.mocked(api.usage.getTerm).mockRejectedValue(error)
    const ctx = context({ flags: seriesFlags })
    await Reflect.apply(UsageSeriesCommand.prototype.run, ctx, [])
    expect(ctx.logged[0]).toContain('0.1234')
    expect(ctx.logged[0]).toContain(RENEWAL_ID)
    expect(ctx.logged[0]).toContain(ACCOUNT_ID)
    expect(ctx.style.longError).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })
})

describe('usage projections', () => {
  it('requires an explicit term ID at the CLI parser boundary', async () => {
    await expect(Parser.parse([], {
      args: UsageProjectionsCommand.args, flags: UsageProjectionsCommand.flags,
    })).rejects.toThrow('Missing 1 required arg')
    const parsed = await Parser.parse([TERM_ID], {
      args: UsageProjectionsCommand.args, flags: UsageProjectionsCommand.flags,
    })
    expect(parsed.args).toEqual({ id: TERM_ID })
  })

  it('identifies a requested term that returns the coded no-terms error', async () => {
    vi.mocked(api.usage.getProjections).mockRejectedValue(new NotFoundError({
      statusCode: 404, error: 'Not Found', message: 'No usage terms found', code: 'NO_USAGE_TERMS',
    }))
    const ctx = context({ args: { id: TERM_ID }, flags: { output: 'json' } })
    await Reflect.apply(UsageProjectionsCommand.prototype.run, ctx, [])
    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to load usage projections.',
      `Usage term ${TERM_ID} was not found. Run "checkly account usage terms" to discover available term IDs.`)
    expect(process.exitCode).toBe(1)
  })

  it('requests the completed default without asOf and prints resource JSON without names', async () => {
    const ctx = context({ args: { id: TERM_ID }, flags: { output: 'json' } })
    await Reflect.apply(UsageProjectionsCommand.prototype.run, ctx, [])
    expect(api.usage.getProjections).toHaveBeenCalledExactlyOnceWith(TERM_ID, {})
    expect(api.usage.listTerms).not.toHaveBeenCalled()
    expect(JSON.parse(ctx.logged[0])).toEqual(projectionsFixture)
    expect(api.usage.getTerm).not.toHaveBeenCalled()
  })

  it('maps an explicit completed day and renders human forecast precision with one detail lookup', async () => {
    const ctx = context({ args: { id: TERM_ID }, flags: { 'as-of': '2026-06-01', 'output': 'md' } })
    await Reflect.apply(UsageProjectionsCommand.prototype.run, ctx, [])
    expect(api.usage.getProjections).toHaveBeenCalledExactlyOnceWith(TERM_ID, { asOf: '2026-06-01' })
    expect(api.usage.getTerm).toHaveBeenCalledExactlyOnceWith(TERM_ID)
    expect(ctx.logged[0]).toContain('Acme Corp')
    expect(ctx.logged[0]).toContain('-311.2584')
  })

  it('retains forecast precision and the term ID when optional detail lookup fails', async () => {
    vi.mocked(api.usage.getTerm).mockRejectedValue(new Error('Detail lookup failed'))
    const ctx = context({ args: { id: TERM_ID }, flags: { output: 'md' } })
    await Reflect.apply(UsageProjectionsCommand.prototype.run, ctx, [])
    expect(ctx.logged[0]).toContain('-311.2584')
    expect(ctx.logged[0]).toContain(TERM_ID)
    expect(ctx.style.longError).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('rejects today before calling the API', async () => {
    const ctx = context({ args: { id: TERM_ID }, flags: {
      'as-of': new Date().toISOString().slice(0, 10), 'output': 'json',
    } })
    await Reflect.apply(UsageProjectionsCommand.prototype.run, ctx, [])
    expect(api.usage.getProjections).not.toHaveBeenCalled()
    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to load usage projections.',
      expect.objectContaining({ message: expect.stringContaining('completed UTC date') }))
  })
})

describe('report failure paths', () => {
  it.each([UsageSummaryCommand, UsageSeriesCommand])('rejects old --check-type before transport for %s', async command => {
    const ctx = context({ flags: { ...seriesFlags, 'check-type': ['API'] } })
    await Reflect.apply(command.prototype.run, ctx, [])
    expect(api.usage.getSummary).not.toHaveBeenCalled()
    expect(api.usage.getSeries).not.toHaveBeenCalled()
    expect(ctx.style.longError).toHaveBeenCalledWith(expect.any(String),
      expect.objectContaining({ message: expect.stringContaining('does not support --check-type') }))
    expect(process.exitCode).toBe(2)
  })

  it('reports usage:read permission failures', async () => {
    vi.mocked(api.usage.getSummary).mockRejectedValue(new ForbiddenError({
      statusCode: 403, error: 'Forbidden', message: 'Missing permission',
    }))
    const ctx = context({ flags: { output: 'json' } })
    await Reflect.apply(UsageSummaryCommand.prototype.run, ctx, [])
    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to load usage summary.',
      expect.stringContaining('usage:read permission'))
  })
})

describe('authoritative metadata names', () => {
  it('uses only selected terms and omits conflicting account names even if a later term matches', async () => {
    const unrelatedId = '550e8400-e29b-41d4-a716-446655440009'
    const laterId = '550e8400-e29b-41d4-a716-446655440008'
    vi.mocked(api.usage.listTerms).mockResolvedValue(response({ data: [
      termFixture,
      { ...renewalFixture, accounts: [{ id: ACCOUNT_ID, name: 'Renamed account' }] },
      { ...termFixture, id: laterId },
      { ...termFixture, id: unrelatedId, accounts: [{ id: 'other-account', name: 'Unselected account' }] },
    ], nextId: null }))
    const names = await loadUsageNames([TERM_ID, RENEWAL_ID, laterId, TERM_ID], summaryFixture.period)
    expect([...names.terms.entries()]).toEqual([
      [TERM_ID, 'Acme Corp'], [RENEWAL_ID, 'Acme Renewal'], [laterId, 'Acme Corp'],
    ])
    expect([...names.accounts.entries()]).toEqual([])
    expect(api.usage.getTerm).not.toHaveBeenCalled()
  })

  it.each(['failure', 'missing'] as const)('keeps term names but omits unchecked account names after a later page %s', async outcome => {
    vi.mocked(api.usage.listTerms)
      .mockResolvedValueOnce(response({ data: [termFixture], nextId: 'next-page' }))
    if (outcome === 'failure') {
      vi.mocked(api.usage.listTerms).mockRejectedValueOnce(new Error('Rate limited'))
    } else {
      vi.mocked(api.usage.listTerms).mockResolvedValueOnce(response({ data: [], nextId: null }))
    }
    const names = await loadUsageNames([TERM_ID, RENEWAL_ID], summaryFixture.period)
    expect([...names.terms.entries()]).toEqual([[TERM_ID, 'Acme Corp']])
    expect([...names.accounts.entries()]).toEqual([])
  })
})
