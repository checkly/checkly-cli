import chalk from 'chalk'
import { shellJoin, shellQuote } from '../services/shell.js'
import type {
  UsageBreakdown,
  UsageCalculation,
  UsageCoverage,
  UsageGroupDimension,
  UsageInterval,
  UsagePricingRule,
  UsageProjections,
  UsageProjectionWindow,
  UsageRunCounts,
  UsageSeriesInclude,
  UsageSeriesParams,
  UsageSeriesRow,
  UsageSummary,
  UsageTerm,
  UsageTermsParams,
  UsageUnit,
} from '../rest/usage.js'
import {
  type ColumnDef,
  type DetailField,
  type HeadingLevel,
  type OutputFormat,
  heading,
  renderAdaptiveTable,
  renderCommandHints,
  renderDetailFields,
} from './render.js'

export interface UsageNames {
  terms: ReadonlyMap<string, string>
  accounts: ReadonlyMap<string, string>
}
export interface SeriesFormatOptions {
  interval: UsageInterval
  groupBy: UsageGroupDimension[]
  include: UsageSeriesInclude[]
  unit?: UsageUnit | null
  names?: UsageNames
}

function number (value: number | null | undefined): string {
  return value == null ? '-' : value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

/** Credits print as numbers; US cents print as dollars, keeping the API's sub-cent precision. */
function amount (value: number | null | undefined, unit: UsageUnit | null | undefined): string {
  if (value == null || unit !== 'usdCents') return number(value)
  return (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 })
}

/** The label noun for a unit. A response with no selected term has nothing to count, so it reads as credits. */
function noun (unit: UsageUnit | null | undefined): string {
  return unit === 'usdCents' ? 'USD' : 'credits'
}

function capitalize (value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function percent (value: number | null): string {
  return value === null ? '-' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

function dateRange (period: { from: string, to: string } | null): string {
  return period === null ? '-' : `${period.from} to ${period.to}`
}

function section (title: string, body: string, format: OutputFormat, level: HeadingLevel = 2): string {
  return `${heading(title, level, format)}\n\n${body}`
}

function namedId (id: string | undefined, names?: ReadonlyMap<string, string>): string {
  if (id === undefined) return '-'
  const name = names?.get(id)
  return name && name !== id ? `${name} (${id})` : id
}

export function formatUsageTermsList (terms: UsageTerm[], format: OutputFormat): string {
  if (terms.length === 0) return 'No usage terms found.'
  const columns: ColumnDef<UsageTerm>[] = [
    { header: 'Name', minWidth: 15, maxWidth: 40, value: term => term.name },
    { header: 'ID', minWidth: 38, truncate: false, value: term => term.id },
    { header: 'Contract start', value: term => term.contractStartDate },
    { header: 'Contract end', value: term => term.contractEndDate },
    { header: 'Usage start', value: term => term.usageStartDate },
    { header: 'Budget', align: 'right', value: term => amount(term.unitBudget, term.unit) },
    { header: 'Package model', value: term => term.packageModel ?? '-' },
    { header: 'Accounts', align: 'right', value: term => String(term.accounts.length) },
  ]
  return renderAdaptiveTable(columns, terms, format)
}

function formatPricingRule (rule: UsagePricingRule | null, format: OutputFormat, level: 3 | 4): string {
  if (rule === null) return 'Pricing rule unavailable.'
  switch (rule.method) {
    case 'per_unit': {
      const fields: DetailField<typeof rule>[] = [
        { label: 'Method', value: value => value.method },
        { label: 'Quantity', value: value => number(value.quantity) },
        { label: 'Unit', value: value => value.unit },
        { label: 'Credits', value: value => number(value.credits) },
        { label: 'Included quantity', value: value => number(value.included?.quantity) },
        { label: 'Included period', value: value => value.included?.period ?? '-' },
      ]
      const output = [renderDetailFields('Pricing rule', fields, rule, format, level)]
      if (rule.rates !== undefined) {
        output.push(section('Conditional rates', renderAdaptiveTable([
          { header: 'Condition', value: rate => rate.when },
          { header: 'Credits', align: 'right', value: rate => number(rate.credits) },
        ], rule.rates, format), format, level === 3 ? 4 : 5))
      }
      return output.join('\n\n')
    }
    case 'per_period':
      return renderDetailFields('Pricing rule', [
        { label: 'Method', value: value => value.method },
        { label: 'Period', value: value => value.period },
        { label: 'Annual credits', value: value => number(value.price.annualCredits) },
      ], rule, format, level)
    case 'capacity_blocks_per_period':
      return renderDetailFields('Pricing rule', [
        { label: 'Method', value: value => value.method },
        { label: 'Period', value: value => value.period },
        { label: 'Unit', value: value => value.unit },
        { label: 'Included quantity', value: value => number(value.included.quantity) },
        { label: 'Block quantity', value: value => number(value.block.quantity) },
        { label: 'Annual credits per block', value: value => number(value.block.annualCredits) },
      ], rule, format, level)
    default: {
      const exhaustive: never = rule
      return exhaustive
    }
  }
}

export function formatUsageTermDetail (term: UsageTerm, format: OutputFormat): string {
  const fields: DetailField<UsageTerm>[] = [
    { label: 'ID', value: value => value.id },
    { label: 'Contract period', value: value => `${value.contractStartDate} to ${value.contractEndDate}` },
    { label: 'Usage start date', value: value => value.usageStartDate },
    { label: 'Unit', value: value => value.unit },
    { label: 'Budget', value: value => amount(value.unitBudget, value.unit) },
    { label: 'Package model', value: value => value.packageModel ?? '-' },
    { label: 'Standard credits / unit', value: value => number(value.standardCreditsPerUnit) },
    { label: 'Premium credits / unit', value: value => number(value.premiumCreditsPerUnit) },
  ]
  const output = [renderDetailFields(`Usage term: ${term.name}`, fields, term, format, 1)]
  output.push(section('Accounts', renderAdaptiveTable([
    { header: 'Name', minWidth: 15, maxWidth: 40, value: account => account.name },
    { header: 'ID', minWidth: 38, truncate: false, value: account => account.id },
  ], term.accounts, format), format))
  if (term.pricingRules === null) output.push(section('Pricing rules', 'Pricing rules unavailable.', format))
  else {
    for (const [key, rule] of Object.entries(term.pricingRules)) {
      output.push(section(key, formatPricingRule(rule, format, 3), format))
    }
    if (Object.keys(term.pricingRules).length === 0) output.push(section('Pricing rules', 'No pricing rules.', format))
  }
  return output.join('\n\n')
}

export function formatUsageCoverage (
  coverage: UsageCoverage, format: OutputFormat, unit: UsageUnit | null = null,
): string {
  if (coverage.gaps.length === 0) return ''
  return section(`Coverage gaps (${noun(unit)} unavailable)`, renderAdaptiveTable([
    { header: 'From', value: gap => gap.from },
    { header: 'To', value: gap => gap.to },
  ], coverage.gaps, format), format)
}

function formatCalculation (
  calculation: UsageCalculation, index: number, format: OutputFormat, level: 3 | 4, unit: UsageUnit | null,
): string {
  const title = `Calculation ${index + 1}`
  const used = `${capitalize(noun(unit))} used`
  if ('rateCondition' in calculation) {
    return renderDetailFields(title, [
      { label: 'Rate condition', value: value => value.rateCondition ?? 'Default rate' },
      { label: 'Measured quantity', value: value => number(value.measuredQuantity) },
      { label: 'Included quantity', value: value => number(value.includedQuantity) },
      { label: 'Billable quantity', value: value => number(value.billableQuantity) },
      { label: used, value: value => amount(value.unitsUsed, unit) },
    ], calculation, format, level)
  }
  if ('scope' in calculation) {
    return renderDetailFields(title, [
      { label: 'Scope', value: value => value.scope },
      { label: 'Measured quantity', value: value => number(value.measuredQuantity) },
      { label: 'Included quantity', value: value => number(value.includedQuantity) },
      { label: 'Billable block days', value: value => number(value.billableBlockDays) },
      { label: 'Applied daily credits per block', value: value => number(value.appliedDailyCreditsPerBlock) },
      { label: 'Proration days per year', value: value => String(value.proration.daysPerYear) },
      { label: used, value: value => amount(value.unitsUsed, unit) },
    ], calculation, format, level)
  }
  return renderDetailFields(title, [
    { label: 'Billable resource days', value: value => number(value.billableResourceDays) },
    { label: 'Applied daily credits', value: value => number(value.appliedDailyCredits) },
    { label: 'Proration days per year', value: value => String(value.proration.daysPerYear) },
    { label: used, value: value => amount(value.unitsUsed, unit) },
  ], calculation, format, level)
}

export function formatUsageSummary (summary: UsageSummary, format: OutputFormat): string {
  const { unit } = summary
  const used = `${capitalize(noun(unit))} used`
  const fields: DetailField<UsageSummary>[] = [
    { label: 'Period', value: value => dateRange(value.period) },
    { label: 'Usage term IDs', value: value => value.usageTermsIds.join(', ') || '-' },
    { label: used, value: value => amount(value.totals.unitsUsed, unit) },
  ]
  const columns: ColumnDef<UsageBreakdown>[] = [
    { header: 'Period', truncate: false, value: row => dateRange(row.period) },
  ]
  if (summary.usageTermsIds.length !== 1) {
    columns.push({ header: 'Usage term ID', minWidth: 38, truncate: false, value: row => row.usageTermsId })
  }
  if (summary.breakdown.some(row => row.accountId !== undefined)) {
    columns.push({ header: 'Account ID', minWidth: 38, truncate: false, value: row => row.accountId ?? '-' })
  }
  columns.push(
    { header: 'Pricing rule', truncate: false, value: row => row.pricingRuleKey },
    { header: used, align: 'right', value: row => amount(row.unitsUsed, unit) },
  )
  return [
    renderDetailFields('Usage summary', fields, summary, format, 1),
    formatUsageCoverage(summary.coverage, format, unit),
    summary.breakdown.length === 0
      ? 'No usage breakdowns for the requested range.'
      : section('Usage breakdown', renderAdaptiveTable(columns, summary.breakdown, format), format),
  ].filter(Boolean).join('\n\n')
}

const runColumns: Array<{ key: keyof UsageRunCounts, header: string }> = [
  { key: 'totalRuns', header: 'Total runs' },
  { key: 'finalRuns', header: 'Final runs' },
  { key: 'retryRuns', header: 'Retry runs' },
  { key: 'cancelledRuns', header: 'Cancelled runs' },
  { key: 'degradedRuns', header: 'Degraded runs' },
  { key: 'failedRuns', header: 'Failed runs' },
  { key: 'errorRuns', header: 'Error runs' },
  { key: 'abortedRuns', header: 'Aborted runs' },
  { key: 'overMaxResponseTimeRuns', header: 'Over max response time runs' },
]

export function formatUsageSeries (
  rows: UsageSeriesRow[], format: OutputFormat, options: SeriesFormatOptions,
): string {
  if (rows.length === 0) return 'No usage rows found for the requested range.'
  const { unit = null } = options
  const used = `${capitalize(noun(unit))} used`
  const columns: ColumnDef<UsageSeriesRow>[] = [{
    header: 'Period',
    value: row => options.interval === 'day' ? row.periodStart : `${row.periodStart} to ${row.periodEnd}`,
  }]
  if (options.groupBy.includes('account')) {
    columns.push({
      header: 'Account', minWidth: 15, maxWidth: 60,
      value: row => options.names?.accounts.get(row.dimensions.accountId ?? '') ?? '-',
    }, {
      header: 'Account ID', minWidth: 38, truncate: false,
      value: row => row.dimensions.accountId ?? '-',
    })
  }
  if (options.groupBy.includes('usageTerm')) {
    columns.push({
      header: 'Usage term', minWidth: 15, maxWidth: 60,
      value: row => options.names?.terms.get(row.dimensions.usageTermsId ?? '') ?? '-',
    }, {
      header: 'Usage term ID', minWidth: 38, truncate: false,
      value: row => row.dimensions.usageTermsId ?? '-',
    })
  }
  if (options.groupBy.includes('pricingRule')) {
    columns.push({ header: 'Pricing rule', value: row => row.dimensions.pricingRuleKey ?? '-' })
  }
  if (options.groupBy.includes('checkType')) {
    columns.push({ header: 'Check type', value: row => row.dimensions.checkType === null ? 'Unattributed' : row.dimensions.checkType ?? '-' })
  }
  columns.push({ header: used, align: 'right', value: row => amount(row.unitsUsed, unit) })
  if (options.include.includes('runs') || rows.some(row => row.runs !== undefined)) {
    columns.push(...runColumns.map(({ key, header }): ColumnDef<UsageSeriesRow> => ({
      header, align: 'right', value: row => number(row.runs?.[key]),
    })))
  }
  const output = [renderAdaptiveTable(columns, rows, format)]
  if (options.include.includes('calculations')) {
    for (const [index, row] of rows.entries()) {
      output.push(section(`Row ${index + 1} calculations (${row.periodStart} to ${row.periodEnd})`,
        row.contributions.length === 0
          ? 'No contributions.'
          : row.contributions.map(contribution => {
              const fields: DetailField<typeof contribution>[] = [
                { label: 'Usage term', value: value => namedId(value.usageTermsId, options.names?.terms) },
                { label: 'Pricing rule', value: value => value.pricingRuleKey },
                { label: 'Period', value: value => dateRange(value.period ?? null) },
                { label: used, value: value => amount(value.unitsUsed, unit) },
              ]
              return [
                renderDetailFields('Contribution', fields, contribution, format, 3),
                formatPricingRule(contribution.pricingRule ?? null, format, 4),
                contribution.calculations === undefined
                  ? 'Calculations unavailable.'
                  : contribution.calculations.length === 0 ? 'No calculations.' : '',
                ...contribution.calculations?.map((value, i) => formatCalculation(value, i, format, 4, unit)) ?? [],
              ].filter(Boolean).join('\n\n')
            }).join('\n\n'), format))
    }
  }
  return output.join('\n\n')
}

export function formatUsageProjections (value: UsageProjections, format: OutputFormat, term?: UsageTerm): string {
  const { unit } = value
  const units = noun(unit)
  const fields: DetailField<UsageProjections>[] = [
    { label: 'Usage term', value: report => term ? `${term.name} (${report.usageTermsId})` : report.usageTermsId },
    { label: 'As of (completed UTC day)', value: report => report.asOf },
    { label: 'Period', value: report => dateRange(report.period) },
    { label: 'Weeks since usage start', value: report => String(report.weeksSinceStart) },
    { label: 'Weeks remaining', value: report => String(report.weeksRemaining) },
    { label: `${capitalize(units)} used`, value: report => amount(report.unitsUsed, unit) },
    { label: `Remaining ${units}`, value: report => amount(report.unitsRemaining, unit) },
    { label: `Budgeted daily ${units}`, value: report => amount(report.budgetedDailyUnits, unit) },
  ]
  const windowFields: DetailField<UsageProjectionWindow>[] = [
    { label: 'Period', value: window => dateRange(window.period) },
    { label: 'Observed days', value: window => String(window.observedDays) },
    { label: `${capitalize(units)} used`, value: window => amount(window.unitsUsed, unit) },
    { label: `Average daily ${units}`, value: window => amount(window.averageDailyUnits, unit) },
    { label: 'Annual % of budget', value: window => percent(window.projectedAnnualPercentOfBudget) },
    { label: `${capitalize(units)} at contract end`, value: window => amount(window.projectedUnitsAtContractEnd, unit) },
    { label: `Remaining ${units} at contract end`, value: window => amount(window.projectedUnitsRemaining, unit) },
    { label: '% at contract end', value: window => percent(window.projectedPercentAtContractEnd) },
    { label: 'Weeks until exhausted', value: window => window.projectedWeeksUntilExhausted === null
      ? '-'
      : window.projectedWeeksUntilExhausted.toLocaleString('en-US', { maximumFractionDigits: 2 }) },
  ]
  return [
    renderDetailFields('Usage projections', fields, value, format, 1),
    renderDetailFields('Since usage start', windowFields, value.windows.sinceStart, format, 2),
    renderDetailFields('Last 30 days', windowFields, value.windows.last30Days, format, 2),
    renderDetailFields('Last 7 days', windowFields, value.windows.last7Days, format, 2),
    renderDetailFields('Last 1 day', windowFields, value.windows.last1Day, format, 2),
  ].join('\n\n')
}

export function formatUsagePaginationInfo (count: number, nextId: string | null, noun: string): string {
  return chalk.dim(`Showing ${count} ${noun}${count === 1 ? '' : 's'}${nextId ? ' (more available)' : ''}`)
}

export function usageListCommand (
  kind: 'terms' | 'series', params: UsageTermsParams | UsageSeriesParams, format: OutputFormat = 'terminal',
): string {
  const parts = ['checkly', 'account', 'usage', kind]
  const append = (flag: string, value: string | number | undefined) => {
    if (value !== undefined) parts.push(flag, String(value))
  }
  append('--from', params.from)
  append('--to', params.to)
  append('--limit', params.limit)
  if ('interval' in params) append('--interval', params.interval)
  if ('groupBy' in params) append('--group-by', params.groupBy?.length ? params.groupBy.join(',') : 'none')
  if ('usageTermsIds' in params) for (const id of params.usageTermsIds ?? []) append('--usage-terms-id', id)
  if ('accountIds' in params) for (const id of params.accountIds ?? []) append('--account-id', id)
  if ('pricingRuleKeys' in params) for (const key of params.pricingRuleKeys ?? []) append('--pricing-rule', key)
  if ('include' in params && params.include?.length) append('--include', params.include.join(','))
  if (format === 'md') append('--output', 'md')
  return shellJoin(parts)
}

export function formatUsageNavigationHints (
  nextId: string | null, baseCommand: string, format: OutputFormat,
): string {
  if (nextId === null) return ''
  const command = `${baseCommand} --cursor ${shellQuote(nextId)}`
  if (format === 'md') {
    const delimiter = '`'.repeat(Math.max(1, ...Array.from(command.matchAll(/`+/g), match => match[0].length + 1)))
    return `Next page: ${delimiter}${command}${delimiter}`
  }
  return renderCommandHints([{ label: 'Next page', command }], { gap: 1 })
}
