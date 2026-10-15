import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import type { UsageGroupDimension } from '../../rest/usage.js'
import { stripAnsi, visWidth } from '../render.js'
import {
  formatUsageCoverage, formatUsageNavigationHints, formatUsagePaginationInfo, formatUsageProjections,
  formatUsageSeries, formatUsageSummary, formatUsageTermDetail, formatUsageTermsList, usageListCommand,
} from '../usage.js'
import {
  ACCOUNT_ID, projectionsFixture, RENEWAL_ID, seriesFixture, summaryFixture, termFixture, TERM_ID,
} from './__fixtures__/usage-fixtures.js'

const originalColumns = process.stdout.columns
afterEach(() => Object.defineProperty(process.stdout, 'columns', { configurable: true, value: originalColumns }))

describe('usage terms display', () => {
  it('lists term identity, dates, budget, model and account count', () => {
    const output = formatUsageTermsList([termFixture], 'md')
    expect(output).toContain('| Name | ID | Contract start | Contract end | Usage start | Credit budget | Package model |')
    expect(output).toContain(`| Acme Corp | ${TERM_ID} | 2026-01-01 | 2026-06-30 | 2026-01-02 | 1,000 | credits | 1 |`)
    expect(formatUsageTermsList([], 'terminal')).toBe('No usage terms found.')
  })

  it.each(['terminal', 'md'] as const)('shows all pricing variants and conditional rate details in %s', format => {
    const output = stripAnsi(formatUsageTermDetail(termFixture, format))
    for (const value of ['Acme Corp', TERM_ID, 'Acme Production', ACCOUNT_ID, 'credits',
      'per_unit', 'per_period', 'capacity_blocks_per_period', '0.1234', '0.5678', '365.0123', '36.5012']) {
      expect(output).toContain(value)
    }
    for (const label of ['Included quantity', 'Included period', 'Quantity', 'Unit', 'Conditional rates',
      'Block quantity', 'Annual credits per block', 'Standard credits / unit']) {
      expect(output).toContain(label)
    }
  })

  it('escapes Markdown cells and distinguishes missing pricing from empty pricing', () => {
    const output = formatUsageTermDetail({ ...termFixture, accounts: [{ id: ACCOUNT_ID, name: 'Production | East' }],
      creditBudget: null, pricingRules: null }, 'md')
    expect(output).toContain('Production \\| East')
    expect(output).toContain('| Credit budget | - |')
    expect(output).toContain('Pricing rules unavailable.')
    expect(formatUsageTermDetail({ ...termFixture, pricingRules: {} }, 'md')).toContain('No pricing rules.')
  })
})

describe('usage reports display', () => {
  it('nests term pricing under its rule', () => {
    expect(formatUsageTermDetail(termFixture, 'md').match(/^#+ .+$/gm)).toEqual([
      '# Usage term: Acme Corp', '## Accounts', '## apiChecks', '### Pricing rule',
      '#### Conditional rates', '## statusPages', '### Pricing rule',
      '## statusPageAdditionalServices', '### Pricing rule',
    ])
  })

  it('nests multiple series contributions and their calculations under the row', () => {
    const row = seriesFixture.data[0]
    const contributions = row.contributions.map(value => ({
      ...value,
      pricingRule: value.pricingRule?.method === 'per_unit'
        ? { ...value.pricingRule, rates: [{ when: 'premium', credits: 0.5678 }] }
        : value.pricingRule,
      calculations: [...value.calculations ?? [], ...value.calculations ?? []],
    }))
    const output = formatUsageSeries([{ ...row, contributions: [...contributions, ...contributions] }], 'md', {
      interval: 'day', groupBy: [], include: ['calculations'],
    })
    expect(output.match(/^#+ .+$/gm)).toEqual([
      '## Row 1 calculations (2026-07-02 to 2026-07-02)',
      '### Contribution', '#### Pricing rule', '##### Conditional rates',
      '#### Calculation 1', '#### Calculation 2',
      '### Contribution', '#### Pricing rule', '##### Conditional rates',
      '#### Calculation 1', '#### Calculation 2',
    ])
  })

  it.each([
    { groupBy: 'usageTerm', dimension: 'usageTermsId', ids: [TERM_ID, RENEWAL_ID], width: 60,
      header: 'USAGE TERM ID' },
    { groupBy: 'account', dimension: 'accountId', ids: [ACCOUNT_ID, '55555555-5555-4555-8555-555555555555'],
      width: 100, header: 'ACCOUNT ID' },
  ] as const)('retains distinct $groupBy UUIDs and credit precision when shared names shrink', value => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: value.width })
    const rows = value.ids.map(id => ({
      ...seriesFixture.data[0], dimensions: { [value.dimension]: id }, runs: undefined,
    }))
    const name = 'The same unusually long organization name across both accounts and renewal terms'
    const names = new Map(value.ids.map(id => [id, name]))
    const output = stripAnsi(formatUsageSeries(rows, 'terminal', {
      interval: 'day', groupBy: [value.groupBy], include: [],
      names: { terms: names, accounts: names },
    }))
    expect(output).toContain(value.header)
    for (const id of value.ids) expect(output).toContain(id)
    if (value.groupBy === 'account') {
      for (const line of output.split('\n')) expect(visWidth(line)).toBeLessThanOrEqual(100)
    }
    expect(output).toContain('…')
    expect(output).toContain('0.1234')
  })

  it.each(['terminal', 'md'] as const)('keeps summary gaps, identities and precise charges in compact %s output', format => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 100 })
    const summary = { ...summaryFixture, breakdown: summaryFixture.breakdown.map((row, index) => ({
      ...row, creditsUsed: index === 2 ? null : row.creditsUsed,
    })) }
    const output = stripAnsi(formatUsageSummary(summary, format))
    expect(output).toContain('Coverage gaps (credits unavailable)')
    expect(output).toContain('2026-07-01')
    expect(output).toContain(TERM_ID)
    expect(output).toContain(RENEWAL_ID)
    expect(output).toContain(ACCOUNT_ID)
    expect(output).toContain('0.6047')
    expect(output).toContain('2.0002')
    expect(output).not.toContain('Calculation')
    expect(output).not.toContain('Projections')
    expect(output).not.toContain('Meters')
    if (format === 'md') {
      expect(output.match(/^#+ .+$/gm)).toEqual([
        '# Usage summary', '## Coverage gaps (credits unavailable)', '## Usage breakdown',
      ])
      expect(output).toContain('| Credits used | - |')
      expect(output).toContain([
        '| Period | Usage term ID | Account ID | Pricing rule | Credits used |',
        '| --- | --- | --- | --- | ---: |',
        `| 2026-06-30 to 2026-06-30 | ${TERM_ID} | ${ACCOUNT_ID} | apiChecks | 0.6047 |`,
        `| 2026-06-30 to 2026-06-30 | ${TERM_ID} | - | statusPages | 2.0002 |`,
        `| 2026-07-02 to 2026-07-02 | ${RENEWAL_ID} | - | statusPageAdditionalServices | - |`,
      ].join('\n'))
    } else {
      expect(output).toMatch(/Credits used:\s+-/)
      expect(output).toContain('USAGE TERM ID')
      expect(output).toContain('ACCOUNT ID')
      expect(output).toContain('statusPageAdditionalServices')
      expect(output.split('\n').filter(line => line.includes('Usage breakdown'))).toHaveLength(1)
      expect(output.split('\n').length).toBeLessThan(30)
    }
  })

  it('uses the summary context for a single term and omits unattributed account columns', () => {
    const summary = { ...summaryFixture, usageTermsIds: [TERM_ID], breakdown: [{
      ...summaryFixture.breakdown[0], accountId: undefined, creditsUsed: 0,
    }] }
    const output = formatUsageSummary(summary, 'md')
    expect(output).toContain(`| Usage term IDs | ${TERM_ID} |`)
    expect(output).toContain([
      '| Period | Pricing rule | Credits used |',
      '| --- | --- | ---: |',
      '| 2026-06-30 to 2026-06-30 | apiChecks | 0 |',
    ].join('\n'))
    expect(output).not.toContain('Account ID')
    expect(output).not.toContain('| Usage term ID |')
  })

  it('keeps empty summary metadata and coverage visible without inventing no terms', () => {
    const output = formatUsageSummary({ ...summaryFixture, breakdown: [] }, 'md')
    expect(output).toContain('| Period | 2026-06-30 to 2026-07-02 |')
    expect(output).toContain('Coverage gaps (credits unavailable)')
    expect(output).toContain('No usage breakdowns for the requested range.')
    expect(output).not.toContain('No usage terms')
  })

  const groupings: UsageGroupDimension[][] = [
    [], ['account'], ['usageTerm'], ['pricingRule'], ['checkType'],
    ['checkType', 'pricingRule', 'usageTerm', 'account'],
  ]
  it.each(groupings.map(groupBy => ({ groupBy })))('renders only the selected dimensions $groupBy', ({ groupBy }) => {
    const row = { ...seriesFixture.data[0], runs: undefined }
    const output = formatUsageSeries([row], 'md', { interval: 'day', groupBy, include: [] })
    const headers = output.split('\n')[0]
    for (const [dimension, header] of [
      ['account', 'Account'], ['account', 'Account ID'], ['usageTerm', 'Usage term'], ['usageTerm', 'Usage term ID'],
      ['pricingRule', 'Pricing rule'], ['checkType', 'Check type'],
    ] as const) {
      expect(headers.includes(`| ${header} |`)).toBe(groupBy.includes(dimension))
    }
    expect(headers).not.toContain('Total runs')
    expect(output).toContain('0.1234')
  })

  it('renders canonical dimension order, authoritative names and optional runs with all nine counters', () => {
    const output = formatUsageSeries(seriesFixture.data, 'md', {
      interval: 'month', groupBy: ['checkType', 'pricingRule', 'usageTerm', 'account'], include: ['runs'],
      names: { terms: new Map([[RENEWAL_ID, 'Renewal']]), accounts: new Map([[ACCOUNT_ID, 'Production']]) },
    })
    expect(output).toContain('| Period | Account | Account ID | Usage term | Usage term ID | Pricing rule | Check type | Credits used |')
    expect(output).toContain(`| Production | ${ACCOUNT_ID} |`)
    expect(output).toContain(`| Renewal | ${RENEWAL_ID} |`)
    expect(output).toContain('| 13 | 10 | 3 | 1 | 2 | 4 | 5 | 6 | 7 |')
  })

  it('distinguishes absent run data, unavailable run counts, zero run counts and unattributed check types', () => {
    const base = { ...seriesFixture.data[0], dimensions: { checkType: null } }
    const zeroRuns = { totalRuns: 0, finalRuns: 0, retryRuns: 0, cancelledRuns: 0, degradedRuns: 0,
      failedRuns: 0, errorRuns: 0, abortedRuns: 0, overMaxResponseTimeRuns: 0 }
    const output = formatUsageSeries([
      { ...base, runs: undefined }, { ...base, runs: null }, { ...base, runs: zeroRuns },
    ], 'md', { interval: 'day', groupBy: ['checkType'], include: ['runs'] })
    expect(output).toContain('Unattributed')
    expect(output.match(/\| - \| - \| - \| - \| - \| - \| - \| - \| - \|/g)).toHaveLength(2)
    expect(output).toContain('| 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |')
  })

  it('shows requested contribution calculations separately from measured run counters', () => {
    const row = seriesFixture.data[0]
    const output = formatUsageSeries([{
      ...row, contributions: [...row.contributions, ...summaryFixture.breakdown],
    }], 'md', {
      interval: 'day', groupBy: ['pricingRule'], include: ['calculations'],
    })
    expect(output).toContain('Row 1 calculations (2026-07-02 to 2026-07-02)')
    expect(output).toContain('| Rate condition | premium |')
    expect(output).toContain('| Measured quantity | 1,000 |')
    expect(output).toContain('| Included quantity | - |')
    expect(output).toContain('| Billable quantity | 1,000 |')
    expect(output).toContain('| Period | 2026-07-02 to 2026-07-02 |')
    expect(output).toContain(RENEWAL_ID)
    expect(output).toContain('| Rate condition | Default rate |')
    expect(output).toContain('| Billable quantity | 4,900 |')
    expect(output).toContain('| Billable resource days | 2 |')
    expect(output).toContain('| Applied daily credits | 1.0001 |')
    expect(output).toContain('| Proration days per year | 365 |')
    expect(output).toContain('| Scope | statusPage |')
    expect(output).toContain('| Billable block days | 2 |')
    expect(output).toContain('| Applied daily credits per block | 0.1 |')
  })

  it('renders empty coverage and series independently', () => {
    expect(formatUsageCoverage({ gaps: [] }, 'terminal')).toBe('')
    expect(formatUsageSeries([], 'md', { interval: 'day', groupBy: [], include: [] }))
      .toBe('No usage rows found for the requested range.')
  })
})
describe('projections display', () => {
  it('nests every forecast window under one projection report', () => {
    expect(formatUsageProjections(projectionsFixture, 'md').match(/^#+ .+$/gm)).toEqual([
      '# Usage projections', '## Since usage start', '## Last 30 days', '## Last 7 days', '## Last 1 day',
    ])
  })

  it('preserves negative remaining credits, four decimal forecasts, windows and unavailable values', () => {
    const output = formatUsageProjections(projectionsFixture, 'md', termFixture)
    expect(output).toContain('| Remaining credits | -100.0001 |')
    expect(output).toContain('| Remaining credits at contract end | -311.2584 |')
    expect(output).toContain('| Credits at contract end | 1,311.2584 |')
    expect(output).toContain('| Annual % of budget | 265.89% |')
    expect(output).toContain('| Average daily credits | - |')
    expect(output).toContain('| Weeks until exhausted | 0 |')
    expect(output).toContain('Last 30 days')
    expect(output).toContain('Last 7 days')
    expect(output).toContain('Last 1 day')
    expect(output).toContain('| As of (completed UTC day) | 2026-06-01 |')
  })

  it('shows a pre-start unavailable period with zero observed usage', () => {
    const window = { period: null, observedDays: 0, creditsUsed: 0, averageDailyCredits: null,
      projectedAnnualPercentOfBudget: null, projectedCreditsAtContractEnd: null, projectedRemainingCredits: null,
      projectedPercentAtContractEnd: null, projectedWeeksUntilExhausted: null }
    const output = formatUsageProjections({ ...projectionsFixture, period: null, creditsUsed: 0,
      windows: { sinceStart: window, last30Days: window, last7Days: window, last1Day: window } }, 'md')
    expect(output).toContain('| Period | - |')
    expect(output).toContain('| Observed days | 0 |')
    expect(output).toContain('| Credits used | 0 |')
  })
})

describe('pagination display', () => {
  it('describes empty pages with continuation and singular terms', () => {
    expect(stripAnsi(formatUsagePaginationInfo(0, 'cursor', 'usage row')))
      .toBe('Showing 0 usage rows (more available)')
    expect(stripAnsi(formatUsagePaginationInfo(1, null, 'usage term'))).toBe('Showing 1 usage term')
  })
  it('omits navigation when there is no next page', () => {
    expect(formatUsageNavigationHints(null, 'checkly account usage terms', 'terminal')).toBe('')
  })

  it.skipIf(process.platform === 'win32')('recovers every pagination argument and Markdown code delimiter safely', () => {
    const command = usageListCommand('series', { from: '2026-01-01', to: '2026-01-31', limit: 100,
      groupBy: [], interval: 'day', usageTermsIds: [TERM_ID], accountIds: [ACCOUNT_ID],
      pricingRuleKeys: ['apiChecks'], include: ['runs', 'calculations'] }, 'md')
    const cursor = 'opaque\'`$() with spaces;|\\'
    const output = formatUsageNavigationHints(cursor, command, 'md')
    expect(output).toMatch(/^Next page: ``checkly .+``$/)
    const replay = output.slice('Next page: ``'.length, -2)
    const recovered = execFileSync('/bin/sh', ['-c', `set -- ${replay}; printf '%s\\0' "$@"`], {
      encoding: 'utf8',
    }).split('\0').slice(0, -1)
    expect(recovered).toEqual([
      'checkly', 'account', 'usage', 'series', '--from', '2026-01-01', '--to', '2026-01-31',
      '--limit', '100', '--interval', 'day', '--group-by', 'none', '--usage-terms-id', TERM_ID,
      '--account-id', ACCOUNT_ID, '--pricing-rule', 'apiChecks', '--include', 'runs,calculations',
      '--output', 'md', '--cursor', cursor,
    ])
  })
})
