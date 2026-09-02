import chalk from 'chalk'
import logSymbols from 'log-symbols'
import type {
  AiInvocationMeasures,
  CheckRunMeasures,
  UsageAccount,
  UsageGroupBy,
  UsageInterval,
  UsageMetrics,
  UsageProjectionWindow,
  UsageRow,
  UsageSummary,
  UsageTerms,
  UsageWarning,
} from '../rest/usage.js'
import {
  type ColumnDef,
  type DetailField,
  type OutputFormat,
  escapeMdCell,
  formatMs,
  padColumn,
  renderAdaptiveTable,
  renderCommandHints,
  renderDetailFields,
} from './render.js'

// --- Shared helpers ---

export function checkRunMeasures (metrics: UsageMetrics): CheckRunMeasures | undefined {
  for (const meter of metrics.meters) {
    if (meter.meterType === 'CHECK_RUN') return meter.measures
  }
  return undefined
}

export function aiInvocationMeasures (metrics: UsageMetrics): AiInvocationMeasures | undefined {
  for (const meter of metrics.meters) {
    if (meter.meterType === 'AI_INVOCATION') return meter.measures
  }
  return undefined
}

function dash (format: OutputFormat): string {
  return format === 'terminal' ? chalk.dim('-') : '-'
}

function formatNumber (value: number | null | undefined, format: OutputFormat): string {
  if (value === null || value === undefined) return dash(format)
  return Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatPercent (value: number | null | undefined, format: OutputFormat): string {
  if (value === null || value === undefined) return dash(format)
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

function dateRange (from: string, to: string): string {
  return `${from} → ${to}`
}

function sectionHeading (text: string, format: OutputFormat): string {
  return format === 'md' ? `## ${text}` : chalk.bold(text.toUpperCase())
}

interface MeasureEntry {
  label: string
  value: string
}

function renderMeasureList (entries: MeasureEntry[], format: OutputFormat): string {
  if (format === 'md') {
    return [
      '| Measure | Value |',
      '| --- | --- |',
      ...entries.map(entry => `| ${entry.label} | ${escapeMdCell(entry.value)} |`),
    ].join('\n')
  }

  const labelWidth = Math.max(0, ...entries.map(entry => entry.label.length)) + 3
  return entries
    .map(entry => `${chalk.dim(padColumn(`${entry.label}:`, labelWidth, 'left', false))}${entry.value}`)
    .join('\n')
}

// --- Terms detail ---

const termsDetailFields: DetailField<UsageTerms>[] = [
  { label: 'Organization', value: terms => terms.name },
  { label: 'Contract period', value: terms => dateRange(terms.contractStartDate, terms.contractEndDate) },
  { label: 'Usage start date', value: terms => terms.usageStartDate },
  { label: 'Credit budget', value: (terms, fmt) => formatNumber(terms.creditBudget, fmt) },
  { label: 'Standard credits / unit', value: (terms, fmt) => formatNumber(terms.standardCreditsPerUnit, fmt) },
  { label: 'Premium credits / unit', value: (terms, fmt) => formatNumber(terms.premiumCreditsPerUnit, fmt) },
  { label: 'Accounts', value: terms => String(terms.accounts.length) },
  { label: 'ID', value: terms => terms.id },
]

function buildAccountColumns (format: OutputFormat): ColumnDef<UsageAccount>[] {
  if (format === 'md') {
    return [
      { header: 'Name', value: account => account.name },
      { header: 'ID', value: account => account.id },
    ]
  }

  return [
    { header: 'Name', minWidth: 12, maxWidth: 40, value: account => account.name },
    { header: 'ID', width: 38, value: account => chalk.dim(account.id) },
  ]
}

export function formatUsageTermsDetail (terms: UsageTerms, format: OutputFormat): string {
  const lines: string[] = []
  lines.push(renderDetailFields(`Usage terms: ${terms.name}`, termsDetailFields, terms, format))
  lines.push('')
  lines.push(sectionHeading('Accounts', format))
  if (format === 'md') lines.push('')
  lines.push(renderAdaptiveTable(buildAccountColumns(format), terms.accounts, format))
  return lines.join('\n')
}

// --- Warnings ---

export function formatUsageWarnings (warnings: UsageWarning[], format: OutputFormat): string {
  if (warnings.length === 0) return ''

  if (format === 'md') {
    return warnings.map(warning => `> **Warning (${warning.code}):** ${warning.message}`).join('\n')
  }

  return warnings
    .map(warning => `${logSymbols.warning} ${chalk.yellow(warning.message)} ${chalk.dim(`(${warning.code})`)}`)
    .join('\n')
}

// --- Summary ---

interface SummaryView {
  summary: UsageSummary
  terms?: UsageTerms
}

function creditsLabel (metrics: UsageMetrics, format: OutputFormat): string {
  const { used, percentOfBudget } = metrics.credits
  if (used === null) return dash(format)
  const usedLabel = formatNumber(used, format)
  return percentOfBudget === null ? usedLabel : `${usedLabel} (${formatPercent(percentOfBudget, format)} of budget)`
}

const summaryHeaderFields: DetailField<SummaryView>[] = [
  { label: 'Period', value: view => dateRange(view.summary.period.from, view.summary.period.to) },
  {
    label: 'Contract',
    value: view => (view.terms ? dateRange(view.terms.contractStartDate, view.terms.contractEndDate) : null),
  },
  {
    label: 'Progress',
    value: view => {
      const { weeksSinceStart, weeksRemaining } = view.summary.projections
      return `${weeksSinceStart} weeks since usage start, ${weeksRemaining} remaining`
    },
  },
  { label: 'Credit budget', value: (view, fmt) => (view.terms ? formatNumber(view.terms.creditBudget, fmt) : null) },
  { label: 'Credits used', value: (view, fmt) => creditsLabel(view.summary.totals, fmt) },
  { label: 'Remaining credits', value: (view, fmt) => formatNumber(view.summary.projections.remainingCredits, fmt) },
  { label: 'Usage terms ID', value: view => view.summary.usageTermsId },
]

function checkRunEntries (metrics: UsageMetrics, format: OutputFormat): MeasureEntry[] {
  const measures = checkRunMeasures(metrics)
  if (!measures) return [{ label: 'Check runs', value: dash(format) }]

  return [
    { label: 'Total runs', value: formatNumber(measures.totalRuns, format) },
    { label: 'Final runs', value: formatNumber(measures.finalRuns, format) },
    { label: 'Retry runs', value: formatNumber(measures.retryRuns, format) },
    { label: 'Cancelled runs', value: formatNumber(measures.cancelledRuns, format) },
    { label: 'Degraded runs', value: formatNumber(measures.degradedRuns, format) },
    { label: 'Failed runs', value: formatNumber(measures.failedRuns, format) },
    { label: 'Error runs', value: formatNumber(measures.errorRuns, format) },
    { label: 'Aborted runs', value: formatNumber(measures.abortedRuns, format) },
    { label: 'Over max response time runs', value: formatNumber(measures.overMaxResponseTimeRuns, format) },
    { label: 'Multi-step requests', value: formatNumber(measures.multiStepRequests, format) },
    { label: 'Playwright billable duration', value: formatMs(measures.playwrightBillableDurationMs) },
    { label: 'Standard billable units', value: formatNumber(measures.standardBillableUnits, format) },
    { label: 'Premium billable units', value: formatNumber(measures.premiumBillableUnits, format) },
  ]
}

function resolveEntries (metrics: UsageMetrics, format: OutputFormat): MeasureEntry[] {
  const measures = aiInvocationMeasures(metrics)
  if (!measures) return [{ label: 'Invocations', value: dash(format) }]

  return [
    { label: 'Invocations', value: formatNumber(measures.invocations, format) },
    { label: 'Duration', value: formatMs(measures.durationMs) },
  ]
}

interface ProjectionRow {
  window: string
  creditsUsed: number | null
  annualPercent: number | null
  creditsAtEnd: number | null
  percentAtEnd: number | null
  weeksUntilExhausted: number | null
}

function toProjectionRow (label: string, window: UsageProjectionWindow): ProjectionRow {
  return {
    window: label,
    creditsUsed: window.usage.credits.used,
    annualPercent: window.projectedAnnualPercentOfBudget,
    creditsAtEnd: window.projectedCreditsAtContractEnd,
    percentAtEnd: window.projectedPercentAtContractEnd,
    weeksUntilExhausted: window.projectedWeeksUntilExhausted,
  }
}

function buildProjectionColumns (format: OutputFormat): ColumnDef<ProjectionRow>[] {
  const windowColumn: ColumnDef<ProjectionRow> = format === 'md'
    ? { header: 'Window', value: row => row.window }
    : { header: 'Window', width: 20, value: row => row.window }

  return [
    windowColumn,
    { header: 'Credits used', width: 14, align: 'right', value: (row, fmt) => formatNumber(row.creditsUsed, fmt) },
    {
      header: 'Annual % of budget',
      width: 20,
      align: 'right',
      value: (row, fmt) => formatPercent(row.annualPercent, fmt),
    },
    {
      header: 'Credits at contract end',
      width: 25,
      align: 'right',
      value: (row, fmt) => formatNumber(row.creditsAtEnd, fmt),
    },
    { header: '% at contract end', width: 19, align: 'right', value: (row, fmt) => formatPercent(row.percentAtEnd, fmt) },
    {
      header: 'Weeks until exhausted',
      width: 23,
      align: 'right',
      value: (row, fmt) => formatNumber(row.weeksUntilExhausted, fmt),
    },
  ]
}

export function formatUsageSummary (summary: UsageSummary, format: OutputFormat, terms?: UsageTerms): string {
  const view: SummaryView = { summary, terms }
  const title = terms ? `Usage: ${terms.name}` : 'Usage summary'
  const { windows } = summary.projections
  const projectionRows: ProjectionRow[] = [
    toProjectionRow('Since usage start', windows.sinceStart),
    toProjectionRow('Last 30 days', windows.last30Days),
    toProjectionRow('Last 7 days', windows.last7Days),
    toProjectionRow('Last 1 day', windows.last1Day),
  ]
  // Markdown needs a blank line between a heading and the table that follows it.
  const headingGap = format === 'md' ? [''] : []

  const lines: string[] = []
  lines.push(renderDetailFields(title, summaryHeaderFields, view, format))
  lines.push('')
  lines.push(sectionHeading('Check runs', format), ...headingGap)
  lines.push(renderMeasureList(checkRunEntries(summary.totals, format), format))
  lines.push('')
  lines.push(sectionHeading('Resolve', format), ...headingGap)
  lines.push(renderMeasureList(resolveEntries(summary.totals, format), format))
  lines.push('')
  lines.push(sectionHeading('Projections', format), ...headingGap)
  lines.push(renderAdaptiveTable(buildProjectionColumns(format), projectionRows, format))

  return lines.join('\n')
}

// --- Series ---

export interface UsageSeriesTableOptions {
  interval: UsageInterval
  groupBy: UsageGroupBy
  accountNames?: Map<string, string>
}

function periodLabel (row: UsageRow, interval: UsageInterval): string {
  return interval === 'day' ? row.periodStart : dateRange(row.periodStart, row.periodEnd)
}

function buildSeriesColumns (format: OutputFormat, options: UsageSeriesTableOptions): ColumnDef<UsageRow>[] {
  const accountLabel = (row: UsageRow, fmt: OutputFormat): string => {
    if (!row.accountId) return dash(fmt)
    return options.accountNames?.get(row.accountId) ?? row.accountId
  }

  const columns: ColumnDef<UsageRow>[] = [
    { header: 'Period', width: options.interval === 'day' ? 12 : 25, value: row => periodLabel(row, options.interval) },
  ]

  if (options.groupBy.includes('account')) {
    columns.push({ header: 'Account', minWidth: 10, maxWidth: 40, value: (row, fmt) => accountLabel(row, fmt) })
    if (format === 'md') {
      columns.push({ header: 'Account ID', value: (row, fmt) => row.accountId ?? dash(fmt) })
    }
  }

  if (options.groupBy.includes('checkType')) {
    columns.push({ header: 'Check type', width: 13, value: (row, fmt) => row.checkType ?? dash(fmt) })
  }

  columns.push(
    {
      header: 'Total runs',
      width: 12,
      align: 'right',
      value: (row, fmt) => formatNumber(checkRunMeasures(row)?.totalRuns, fmt),
    },
    {
      header: 'Standard units',
      width: 16,
      align: 'right',
      value: (row, fmt) => formatNumber(checkRunMeasures(row)?.standardBillableUnits, fmt),
    },
    {
      header: 'Premium units',
      width: 15,
      align: 'right',
      value: (row, fmt) => formatNumber(checkRunMeasures(row)?.premiumBillableUnits, fmt),
    },
    { header: 'Credits', width: 10, align: 'right', value: (row, fmt) => formatNumber(row.credits.used, fmt) },
    {
      header: '% of budget',
      width: 13,
      align: 'right',
      value: (row, fmt) => formatPercent(row.credits.percentOfBudget, fmt),
    },
    {
      header: 'Resolve invocations',
      width: 21,
      align: 'right',
      value: (row, fmt) => formatNumber(aiInvocationMeasures(row)?.invocations, fmt),
    },
  )

  return columns
}

export function formatUsageSeries (rows: UsageRow[], format: OutputFormat, options: UsageSeriesTableOptions): string {
  return renderAdaptiveTable(buildSeriesColumns(format, options), rows, format)
}

export function formatUsageSeriesPaginationInfo (count: number, nextId: string | null): string {
  const base = `${count} usage row${count !== 1 ? 's' : ''}`
  return chalk.dim(nextId ? `Showing ${base} (more available)` : `Showing ${base}`)
}

export function formatUsageSeriesNavigationHints (nextId: string | null, seriesCommand: string): string {
  if (!nextId) return ''
  return renderCommandHints([{ label: 'Next page', command: `${seriesCommand} --cursor ${nextId}` }], { gap: 1 })
}
