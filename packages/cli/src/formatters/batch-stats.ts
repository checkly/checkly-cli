import chalk from 'chalk'
import type { BatchAnalyticsResult } from '../rest/batch-analytics'
import { type CheckWithStatus, type PaginationInfo, resolveStatus } from './checks'
import type { OutputFormat, ColumnDef } from './render'
import { renderTable, truncateToWidth, visWidth } from './render'
import { findUnit, rangeLabels } from './analytics'
import type { QuickRange } from '../rest/analytics'

export type StatsRow = CheckWithStatus & { analytics?: BatchAnalyticsResult }

const TIMING_TYPES = new Set(['API', 'BROWSER', 'PLAYWRIGHT', 'MULTI_STEP', 'URL', 'TCP', 'DNS'])
const ICMP_TYPE = 'ICMP'
const DASH = '—'

/**
 * Format a number with commas as thousands separator.
 * e.g. 1240 → "1,240"
 */
function formatWithCommas (n: number): string {
  return n.toLocaleString('en-US')
}

/**
 * Format a metric value for the batch stats table.
 *
 * Unlike the single-check detail view, the table needs consistent formatting
 * within each column for visual scanning. Key differences from formatMetricValue:
 * - ms values always stay in ms with commas (never switch to seconds),
 *   so "340ms" and "1,240ms" decimal-align when right-justified.
 * - Percentages always use .toFixed(2) + "%" — already consistent.
 */
function formatTableMetric (key: string, value: number, format: OutputFormat): string {
  if (key === 'availability') {
    const display = `${value.toFixed(2)}%`
    if (format === 'md') return display
    if (value >= 99.9) return chalk.green(display)
    if (value >= 99) return chalk.yellow(display)
    return chalk.red(display)
  }

  const unit = findUnit(key)
  if (unit === 'ms') {
    const display = `${formatWithCommas(Math.round(value))}ms`
    if (format === 'md') return display
    if (value < 1000) return chalk.green(display)
    if (value < 5000) return chalk.yellow(display)
    return chalk.red(display)
  }

  if (unit === 'percentage') {
    const display = `${value.toFixed(2)}%`
    if (format === 'md') return display
    return value <= 1 ? chalk.green(display) : chalk.red(display)
  }

  return value.toFixed(2)
}

function metricOrDash (
  key: string,
  value: number | null,
  format: OutputFormat,
  applicable: boolean,
): string {
  if (!applicable || value == null) {
    return format === 'terminal' ? chalk.dim(DASH) : DASH
  }
  return formatTableMetric(key, value, format)
}

function buildColumns (rows: StatsRow[], format: OutputFormat): ColumnDef<StatsRow>[] {
  const hasTiming = rows.some(r => TIMING_TYPES.has(r.checkType))
  const hasIcmp = rows.some(r => r.checkType === ICMP_TYPE)

  if (format === 'md') {
    const cols: ColumnDef<StatsRow>[] = [
      { header: 'Name', value: r => r.name },
      { header: 'Type', value: r => r.checkType },
      { header: 'Status', value: (r, fmt) => resolveStatus(r, fmt) },
      {
        header: 'Availability',
        align: 'right',
        value: (r, fmt) => metricOrDash('availability', r.analytics?.availability ?? null, fmt, true),
      },
    ]
    if (hasTiming) {
      cols.push({
        header: 'Resp (avg)',
        align: 'right',
        value: (r, fmt) => metricOrDash('responseTime_avg', r.analytics?.responseTime_avg ?? null, fmt, TIMING_TYPES.has(r.checkType)),
      })
      cols.push({
        header: 'Resp (p95)',
        align: 'right',
        value: (r, fmt) => metricOrDash('responseTime_p95', r.analytics?.responseTime_p95 ?? null, fmt, TIMING_TYPES.has(r.checkType)),
      })
    }
    if (hasIcmp) {
      cols.push({
        header: 'Latency (avg)',
        align: 'right',
        value: (r, fmt) => metricOrDash('latency_avg', r.analytics?.latency_avg ?? null, fmt, r.checkType === ICMP_TYPE),
      })
      cols.push({
        header: 'Packet Loss',
        align: 'right',
        value: (r, fmt) => metricOrDash('packetLoss_avg', r.analytics?.packetLoss_avg ?? null, fmt, r.checkType === ICMP_TYPE),
      })
    }
    return cols
  }

  // Terminal
  const termWidth = process.stdout.columns || 120
  const typeWidth = 12
  const statusWidth = 10
  const availWidth = 10
  const metricWidth = 12

  const metricCols = (hasTiming ? 2 : 0) + (hasIcmp ? 2 : 0)
  const fixedWidth = typeWidth + statusWidth + availWidth + metricCols * metricWidth
  const nameWidth = Math.min(
    Math.max(4, ...rows.map(r => visWidth(r.name))) + 2,
    Math.max(20, termWidth - fixedWidth - 2),
  )

  const cols: ColumnDef<StatsRow>[] = [
    {
      header: 'Name',
      width: nameWidth,
      value: r => truncateToWidth(r.name, nameWidth - 2),
    },
    {
      header: 'Type',
      width: typeWidth,
      value: r => r.checkType,
    },
    {
      header: 'Status',
      width: statusWidth,
      value: (r, fmt) => resolveStatus(r, fmt),
    },
    {
      header: 'Avail',
      width: availWidth,
      align: 'right',
      value: (r, fmt) => metricOrDash('availability', r.analytics?.availability ?? null, fmt, true),
    },
  ]

  if (hasTiming) {
    cols.push({
      header: 'Resp (avg)',
      width: metricWidth,
      align: 'right',
      value: (r, fmt) => metricOrDash('responseTime_avg', r.analytics?.responseTime_avg ?? null, fmt, TIMING_TYPES.has(r.checkType)),
    })
    cols.push({
      header: 'Resp (p95)',
      width: metricWidth,
      align: 'right',
      value: (r, fmt) => metricOrDash('responseTime_p95', r.analytics?.responseTime_p95 ?? null, fmt, TIMING_TYPES.has(r.checkType)),
    })
  }

  if (hasIcmp) {
    cols.push({
      header: 'Latency',
      width: metricWidth,
      align: 'right',
      value: (r, fmt) => metricOrDash('latency_avg', r.analytics?.latency_avg ?? null, fmt, r.checkType === ICMP_TYPE),
    })
    cols.push({
      header: 'Pkt Loss',
      width: metricWidth,
      align: 'right',
      value: (r, fmt) => metricOrDash('packetLoss_avg', r.analytics?.packetLoss_avg ?? null, fmt, r.checkType === ICMP_TYPE),
    })
  }

  return cols
}

export function formatBatchStats (rows: StatsRow[], range: string, format: OutputFormat): string {
  const rangeDisplay = rangeLabels[range as QuickRange] ?? range
  const columns = buildColumns(rows, format)

  if (format === 'md') {
    const heading = `## Stats (${rangeDisplay})\n\n`
    return heading + renderTable(columns, rows, format)
  }

  const heading = chalk.bold('STATS') + ' ' + chalk.dim(`(${rangeDisplay})`)
  return heading + '\n\n' + renderTable(columns, rows, format)
}

export function formatBatchStatsNavigationHints (
  pagination: PaginationInfo,
  range: string,
  activeFilters: string[],
): string {
  const { page, limit, total } = pagination
  const totalPages = Math.ceil(total / limit)
  const lines: string[] = []

  if (page < totalPages) {
    lines.push(`  ${chalk.dim('Next page:')}     checkly checks stats --page ${page + 1}`)
  }
  if (page > 1) {
    lines.push(`  ${chalk.dim('Prev page:')}     checkly checks stats --page ${page - 1}`)
  }
  lines.push(`  ${chalk.dim('View check:')}    checkly checks get <id>`)
  lines.push(`  ${chalk.dim('Change range:')}  checkly checks stats --range ${range === 'last24Hours' ? 'last7Days' : 'last24Hours'}`)
  if (activeFilters.length === 0) {
    lines.push(`  ${chalk.dim('Filter:')}        checkly checks stats --tag <tag> --type <type> --search <name>`)
  }

  return lines.join('\n')
}
