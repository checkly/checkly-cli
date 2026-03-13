import chalk from 'chalk'
import { formatMs } from './render'
import type { OutputFormat } from './render'
import type { AnalyticsResponse, AnalyticsSeriesEntry, QuickRange } from '../rest/analytics'

export const rangeLabels: Record<QuickRange, string> = {
  last24Hours: 'last 24 hours',
  last7Days: 'last 7 days',
  last30Days: 'last 30 days',
  thisWeek: 'this week',
  thisMonth: 'this month',
  lastWeek: 'last week',
  lastMonth: 'last month',
}

export function extractMetrics (entry: AnalyticsSeriesEntry): Record<string, number> {
  const rawData = entry?.data
  if (!rawData || typeof rawData !== 'object') return {}
  // The API returns data as an array with one element, or as a plain object
  const data = Array.isArray(rawData) ? rawData[0] : rawData
  if (!data || typeof data !== 'object') return {}

  const result: Record<string, number> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value != null && value !== '') {
      const num = typeof value === 'string' ? parseFloat(value) : value
      if (typeof num === 'number' && !isNaN(num)) {
        result[key] = num
      }
    }
  }
  return result
}

export function findUnit (metricKey: string, metadata?: AnalyticsResponse['metadata']): string {
  // Prefer API metadata when available
  if (metadata) {
    // metadata keys may or may not include the aggregation suffix
    const metaEntry = metadata[metricKey]
    if (metaEntry?.unit) return metaEntry.unit
    // Try the base metric name (strip _avg, _p50, etc.)
    const baseName = metricKey.replace(/_(?:avg|p\d+|min|max)$/, '')
    const baseEntry = metadata[baseName]
    if (baseEntry?.unit) return baseEntry.unit
  }

  // Fallback: heuristic-based unit detection
  if (metricKey === 'availability') return 'percentage'
  if (metricKey.includes('packetLoss')) return 'percentage'
  if (metricKey.includes('CLS')) return 'score'
  if (metricKey.includes('responseTime')
    || metricKey.includes('total_')
    || metricKey.includes('latency')
    || metricKey.includes('wait')
    || metricKey.includes('dns_')
    || metricKey.includes('tcp_')
    || metricKey.includes('firstByte')
    || metricKey.includes('download')
    || metricKey.includes('connection')
    || metricKey.includes('data_')
    || metricKey.includes('TTFB')
    || metricKey.includes('FCP')
    || metricKey.includes('LCP')
    || metricKey.includes('TBT')) return 'ms'
  return ''
}

export function formatMetricValue (key: string, value: number, format: OutputFormat, metadata?: AnalyticsResponse['metadata']): string {
  if (key === 'availability') {
    const display = `${value.toFixed(2)}%`
    if (format === 'md') return display
    if (value >= 99.9) return chalk.green(display)
    if (value >= 99) return chalk.yellow(display)
    return chalk.red(display)
  }

  const unit = findUnit(key, metadata)
  if (unit === 'ms') {
    const display = formatMs(value)
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

  if (unit === 'score') {
    const display = value.toFixed(3)
    if (format === 'md') return display
    if (value <= 0.1) return chalk.green(display)
    if (value <= 0.25) return chalk.yellow(display)
    return chalk.red(display)
  }

  // Generic number
  return value.toFixed(2)
}

function humanizeMetricName (name: string): string {
  // Keep all-uppercase acronyms intact (LCP, CLS, TBT, TTFB, FCP)
  // Insert space before uppercase letter only when preceded by a lowercase letter
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, s => s.toUpperCase())
    .trim()
}

export function formatMetricLabel (key: string): string {
  // Turn responseTime_avg into "Response Time (avg)"
  const parts = key.split('_')
  if (parts.length >= 2) {
    const aggregation = parts.pop()!
    const metricName = humanizeMetricName(parts.join(' '))
    return `${metricName} (${aggregation})`
  }
  return humanizeMetricName(key)
}

function seriesGroupLabel (entry: AnalyticsSeriesEntry): string | undefined {
  if (entry.runLocation) return entry.runLocation
  if (entry.statusCode != null) return `HTTP ${entry.statusCode}`
  return undefined
}

function formatEntries (
  metrics: Record<string, number>,
  orderedKeys: string[],
  format: OutputFormat,
  metadata?: AnalyticsResponse['metadata'],
): Array<{ label: string, value: string }> {
  return orderedKeys.map(key => ({
    label: formatMetricLabel(key),
    value: formatMetricValue(key, metrics[key], format, metadata),
  }))
}

export function formatAnalyticsSection (
  response: AnalyticsResponse | undefined,
  range: string,
  format: OutputFormat,
): string {
  if (!response) return ''
  const rangeDisplay = rangeLabels[range as QuickRange] ?? range

  const isGrouped = response.series.length > 1
    || response.series.some(s => s.runLocation || s.statusCode != null)

  if (isGrouped) {
    return formatGroupedSection(response, rangeDisplay, format)
  }

  // Single (non-grouped) response
  const firstEntry = response.series[0]
  if (!firstEntry) return ''

  const metrics = extractMetrics(firstEntry)
  if (Object.keys(metrics).length === 0) return ''

  const orderedKeys = response.requestedMetrics
    ? response.requestedMetrics.filter(key => key in metrics)
    : Object.keys(metrics)
  if (orderedKeys.length === 0) return ''

  const entries = formatEntries(metrics, orderedKeys, format, response.metadata)

  if (format === 'md') {
    const lines = [
      `## Stats (${rangeDisplay})`,
      '',
      '| Metric | Value |',
      '| --- | --- |',
      ...entries.map(e => `| ${e.label} | ${e.value} |`),
    ]
    return lines.join('\n')
  }

  // Terminal
  const maxLabelLen = Math.max(0, ...entries.map(e => e.label.length))
  const padWidth = maxLabelLen + 3

  const lines = [chalk.bold('STATS') + ' ' + chalk.dim(`(${rangeDisplay})`), '']
  for (const { label, value } of entries) {
    const labelStr = `${label}:`
    const padding = ' '.repeat(padWidth - labelStr.length)
    lines.push(`  ${chalk.dim(labelStr)}${padding}${value}`)
  }

  return lines.join('\n')
}

function formatGroupedSection (
  response: AnalyticsResponse,
  rangeDisplay: string,
  format: OutputFormat,
): string {
  const groups: Array<{ groupLabel: string, entries: Array<{ label: string, value: string }> }> = []

  for (const seriesEntry of response.series) {
    const metrics = extractMetrics(seriesEntry)
    if (Object.keys(metrics).length === 0) continue

    const orderedKeys = response.requestedMetrics
      ? response.requestedMetrics.filter(key => key in metrics)
      : Object.keys(metrics)
    if (orderedKeys.length === 0) continue

    const groupLabel = seriesGroupLabel(seriesEntry) ?? 'Unknown'
    const entries = formatEntries(metrics, orderedKeys, format, response.metadata)
    groups.push({ groupLabel, entries })
  }

  if (groups.length === 0) return ''

  if (format === 'md') {
    const lines = [`## Stats (${rangeDisplay})`]
    for (const { groupLabel, entries } of groups) {
      lines.push('', `### ${groupLabel}`, '', '| Metric | Value |', '| --- | --- |')
      lines.push(...entries.map(e => `| ${e.label} | ${e.value} |`))
    }
    return lines.join('\n')
  }

  // Terminal
  const allEntries = groups.flatMap(g => g.entries)
  const maxLabelLen = Math.max(0, ...allEntries.map(e => e.label.length))
  const padWidth = maxLabelLen + 3

  const lines = [chalk.bold('STATS') + ' ' + chalk.dim(`(${rangeDisplay})`)]
  for (const { groupLabel, entries } of groups) {
    lines.push('', `  ${chalk.bold.cyan(groupLabel)}`)
    for (const { label, value } of entries) {
      const labelStr = `${label}:`
      const padding = ' '.repeat(padWidth - labelStr.length)
      lines.push(`    ${chalk.dim(labelStr)}${padding}${value}`)
    }
  }

  return lines.join('\n')
}
