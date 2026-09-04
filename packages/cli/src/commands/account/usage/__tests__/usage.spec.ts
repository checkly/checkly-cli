import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../rest/api', () => ({
  usage: { getTerms: vi.fn(), getSummary: vi.fn(), getSeries: vi.fn() },
}))

import * as api from '../../../../rest/api.js'
import { NotFoundError } from '../../../../rest/errors.js'

const noUsageTerms = () => new NotFoundError({
  statusCode: 404,
  error: 'Not Found',
  message: 'No usage terms found for the requested date',
  code: 'NO_USAGE_TERMS',
} as any)
import UsageTermsCommand from '../terms.js'
import UsageSummaryCommand from '../summary.js'
import UsageSeriesCommand from '../series.js'
import { summaryFixture, termsFixture } from '../../../../formatters/__tests__/__fixtures__/usage-fixtures.js'

export function createCommandContext (parsed: unknown) {
  const logged: string[] = []
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    style: { outputFormat: undefined as string | undefined, longError: vi.fn() },
    logged,
  }
}

describe('usage terms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(api.usage.getTerms).mockResolvedValue({ data: termsFixture } as any)
  })

  it('-o json prints the raw terms', async () => {
    const ctx = createCommandContext({ flags: { output: 'json' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(api.usage.getTerms).toHaveBeenCalledWith({ to: undefined })
    expect(JSON.parse(ctx.logged[0])).toEqual(termsFixture)
  })

  it('passes --to through', async () => {
    const ctx = createCommandContext({ flags: { to: '2026-03-31', output: 'json' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(api.usage.getTerms).toHaveBeenCalledWith({ to: '2026-03-31' })
  })

  it('renders the detail view with follow-up hints', async () => {
    const ctx = createCommandContext({ flags: { output: 'detail' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('Usage terms: Acme Corp')
    expect(ctx.logged[0]).toContain('Acme Production')
    expect(ctx.logged[0]).toContain('checkly account usage summary')
    expect(ctx.logged[0]).toContain('checkly account usage series --interval month --group-by account')
    expect(ctx.logged[0]).not.toContain('--usage-terms-id')
    expect(ctx.logged[0]).not.toContain('--to')
  })

  it('repeats --to in the follow-up hints so they resolve the same terms', async () => {
    const ctx = createCommandContext({ flags: { to: '2026-03-31', output: 'detail' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('checkly account usage summary --to 2026-03-31')
    expect(ctx.logged[0]).toContain('checkly account usage series --interval month --group-by account --to 2026-03-31')
  })

  it('renders markdown without hints', async () => {
    const ctx = createCommandContext({ flags: { output: 'md' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('# Usage terms: Acme Corp')
    expect(ctx.logged[0]).not.toContain('checkly account usage summary')
  })

  it('rejects an invalid --to date before calling the API', async () => {
    const ctx = createCommandContext({ flags: { to: '2026-02-30', output: 'detail' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(api.usage.getTerms).not.toHaveBeenCalled()
    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to load usage terms.',
      expect.objectContaining({ message: '--to must be a valid calendar date in YYYY-MM-DD format.' }),
    )
    expect(process.exitCode).toBe(1)
  })

  it('translates NO_USAGE_TERMS into an actionable message', async () => {
    vi.mocked(api.usage.getTerms).mockRejectedValue(noUsageTerms())
    const ctx = createCommandContext({ flags: { output: 'detail' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to load usage terms.',
      expect.stringContaining('No usage terms cover this account'),
    )
    expect(process.exitCode).toBe(1)
  })

  it('names the --to date when no terms cover it', async () => {
    vi.mocked(api.usage.getTerms).mockRejectedValue(noUsageTerms())
    const ctx = createCommandContext({ flags: { to: '2020-01-01', output: 'detail' } })

    await UsageTermsCommand.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to load usage terms.', expect.stringContaining('on 2020-01-01'))
  })
})

describe('usage summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(api.usage.getSummary).mockResolvedValue({ data: summaryFixture() } as any)
    vi.mocked(api.usage.getTerms).mockResolvedValue({ data: termsFixture } as any)
  })

  it('-o json prints the raw summary without fetching terms', async () => {
    const ctx = createCommandContext({ flags: { output: 'json' } })

    await UsageSummaryCommand.prototype.run.call(ctx as any)

    expect(JSON.parse(ctx.logged[0])).toEqual(summaryFixture())
    expect(api.usage.getTerms).not.toHaveBeenCalled()
  })

  it('maps range flags to API params', async () => {
    const ctx = createCommandContext({
      flags: {
        'from': '2026-01-01',
        'to': '2026-01-31',
        'account-id': ['acc-a', 'acc-b'],
        'check-type': ['API'],
        'output': 'json',
      },
    })

    await UsageSummaryCommand.prototype.run.call(ctx as any)

    expect(api.usage.getSummary).toHaveBeenCalledWith({
      from: '2026-01-01',
      to: '2026-01-31',
      accountIds: ['acc-a', 'acc-b'],
      checkTypes: ['API'],
    })
  })

  it('renders the detail view with terms context and hints', async () => {
    const ctx = createCommandContext({ flags: { output: 'detail' } })

    await UsageSummaryCommand.prototype.run.call(ctx as any)

    expect(api.usage.getTerms).toHaveBeenCalledWith({ to: undefined })
    expect(ctx.logged[0]).toContain('Usage: Acme Corp')
    expect(ctx.logged[0]).toContain('PROJECTIONS')
    expect(ctx.logged[0]).toContain('checkly account usage series --interval day')
    expect(ctx.logged[0]).toContain('checkly account usage terms')
  })

  it('renders markdown', async () => {
    const ctx = createCommandContext({ flags: { output: 'md' } })

    await UsageSummaryCommand.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('# Usage: Acme Corp')
    expect(ctx.logged[0]).toContain('## Projections')
    expect(ctx.logged[0]).not.toContain('checkly account usage series')
  })

  it('names the --to date when no terms cover it', async () => {
    vi.mocked(api.usage.getSummary).mockRejectedValue(noUsageTerms())
    const ctx = createCommandContext({ flags: { to: '2020-01-01', output: 'json' } })

    await UsageSummaryCommand.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to load usage summary.', expect.stringContaining('on 2020-01-01'))
  })

  it('rejects --from after --to before calling the API', async () => {
    const ctx = createCommandContext({ flags: { from: '2026-02-01', to: '2026-01-01', output: 'detail' } })

    await UsageSummaryCommand.prototype.run.call(ctx as any)

    expect(api.usage.getSummary).not.toHaveBeenCalled()
    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to load usage summary.',
      expect.objectContaining({ message: '--from must be on or before --to.' }),
    )
    expect(process.exitCode).toBe(1)
  })
})

const seriesRow = {
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  accountId: termsFixture.accounts[0].id,
  checkType: 'API',
  credits: { used: 6, percentOfBudget: 0.6 },
  meters: [
    {
      meterType: 'CHECK_RUN',
      measures: {
        totalRuns: 3,
        finalRuns: 2,
        retryRuns: 1,
        cancelledRuns: 0,
        multiStepRequests: 0,
        playwrightBillableDurationMs: 0,
        degradedRuns: 0,
        failedRuns: 0,
        errorRuns: 0,
        abortedRuns: 0,
        overMaxResponseTimeRuns: 0,
        standardBillableUnits: 3,
        premiumBillableUnits: 0,
      },
    },
    { meterType: 'AI_INVOCATION', measures: { invocations: 0, durationMs: 0 } },
  ],
}

const seriesFixture = {
  usageTermsId: termsFixture.id,
  period: { from: '2026-01-01', to: '2026-01-31', interval: 'month', groupBy: 'account,checkType' },
  data: [seriesRow],
  length: 1,
  nextId: 'cursor-2',
  warnings: [{ code: 'PARTIAL_WINDOW', message: 'The requested range was clamped.' }],
}

const seriesFlags = {
  'interval': 'month',
  'group-by': 'account,checkType',
  'limit': 100,
  'output': 'table',
}

describe('usage series', () => {
  // The series table has more fixed-width columns than a non-TTY test process's
  // default 120-column fallback allows, which crushes the account column. Widen
  // it the same way packages/cli/src/formatters/__tests__/usage.spec.ts does.
  const originalColumns = process.stdout.columns

  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 350 })
    vi.mocked(api.usage.getSeries).mockResolvedValue({ data: seriesFixture } as any)
    vi.mocked(api.usage.getTerms).mockResolvedValue({ data: termsFixture } as any)
  })

  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: originalColumns })
  })

  it('-o json prints the cursor envelope with period and warnings', async () => {
    const ctx = createCommandContext({ flags: { ...seriesFlags, output: 'json' } })

    await UsageSeriesCommand.prototype.run.call(ctx as any)

    expect(JSON.parse(ctx.logged[0])).toEqual({
      data: [seriesRow],
      pagination: { nextId: 'cursor-2', length: 1 },
      usageTermsId: termsFixture.id,
      period: seriesFixture.period,
      warnings: seriesFixture.warnings,
    })
    expect(api.usage.getTerms).not.toHaveBeenCalled()
  })

  it('maps all flags to API params', async () => {
    const ctx = createCommandContext({
      flags: {
        ...seriesFlags,
        'from': '2026-01-01',
        'to': '2026-01-31',
        'account-id': ['acc-a'],
        'check-type': ['API', 'BROWSER'],
        'limit': 50,
        'cursor': 'cursor-1',
        'output': 'json',
      },
    })

    await UsageSeriesCommand.prototype.run.call(ctx as any)

    expect(api.usage.getSeries).toHaveBeenCalledWith({
      from: '2026-01-01',
      to: '2026-01-31',
      accountIds: ['acc-a'],
      checkTypes: ['API', 'BROWSER'],
      interval: 'month',
      groupBy: 'account,checkType',
      limit: 50,
      nextId: 'cursor-1',
    })
  })

  it('renders warnings, the table with account names, and a next-page hint that repeats the flags', async () => {
    const ctx = createCommandContext({
      flags: { ...seriesFlags, 'from': '2026-01-01', 'to': '2026-01-31', 'check-type': ['API'] },
    })

    await UsageSeriesCommand.prototype.run.call(ctx as any)

    expect(api.usage.getTerms).toHaveBeenCalledWith({ to: '2026-01-31' })
    const out = ctx.logged[0]
    expect(out).toContain('The requested range was clamped.')
    expect(out).toContain('Acme Production')
    expect(out).toContain('Showing 1 usage row (more available)')
    expect(out).toContain(
      'checkly account usage series --interval month --group-by account,checkType --limit 100'
      + ' --from 2026-01-01 --to 2026-01-31 --check-type API --cursor cursor-2',
    )
  })

  it('skips the terms lookup when not grouped by account', async () => {
    vi.mocked(api.usage.getSeries).mockResolvedValue({
      data: {
        ...seriesFixture,
        period: { ...seriesFixture.period, groupBy: 'checkType' },
        data: [{ ...seriesRow, accountId: undefined }],
      },
    } as any)
    const ctx = createCommandContext({ flags: { ...seriesFlags, 'group-by': 'checkType' } })

    await UsageSeriesCommand.prototype.run.call(ctx as any)

    expect(api.usage.getTerms).not.toHaveBeenCalled()
    expect(ctx.logged[0]).not.toContain('ACCOUNT')
  })

  it('prints an empty message with warnings when there are no rows', async () => {
    vi.mocked(api.usage.getSeries).mockResolvedValue({
      data: { ...seriesFixture, data: [], length: 0, nextId: null },
    } as any)
    const ctx = createCommandContext({ flags: seriesFlags })

    await UsageSeriesCommand.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('The requested range was clamped.')
    expect(ctx.logged[0]).toContain('No usage rows found for the requested range.')
  })

  it('renders markdown with a next cursor line and no terminal hints', async () => {
    const ctx = createCommandContext({ flags: { ...seriesFlags, output: 'md' } })

    await UsageSeriesCommand.prototype.run.call(ctx as any)

    const out = ctx.logged[0]
    expect(out).toContain('> **Warning (PARTIAL_WINDOW):**')
    expect(out).toContain('| Period | Account | Account ID |')
    expect(out).toContain('Next page cursor: `cursor-2`')
    expect(out).not.toContain('Next page:')
  })

  it('names the --to date when no terms cover it', async () => {
    vi.mocked(api.usage.getSeries).mockRejectedValue(noUsageTerms())
    const ctx = createCommandContext({ flags: { ...seriesFlags, to: '2020-01-01' } })

    await UsageSeriesCommand.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to load usage series.', expect.stringContaining('on 2020-01-01'))
  })

  it('rejects an out-of-range --limit before calling the API', async () => {
    const ctx = createCommandContext({ flags: { ...seriesFlags, limit: 501 } })

    await UsageSeriesCommand.prototype.run.call(ctx as any)

    expect(api.usage.getSeries).not.toHaveBeenCalled()
    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Failed to load usage series.',
      expect.objectContaining({ message: '--limit must be an integer between 1 and 500.' }),
    )
    expect(process.exitCode).toBe(1)
  })
})
