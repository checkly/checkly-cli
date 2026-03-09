import chalk from 'chalk'
import { formatMs } from './render'
import type { OutputFormat } from './render'
import type { AnalyticsResponse } from '../rest/analytics'

export function extractMetrics (response: AnalyticsResponse): Record<string, number> {
  const data = response?.series?.[0]?.data
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

function findUnit (metricKey: string): string {
  // Map known metric name patterns to units
  if (metricKey === 'availability') return 'percentage'
  if (metricKey.includes('packetLoss')) return 'percentage'
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

export function formatMetricValue (key: string, value: number, format: OutputFormat): string {
  if (key === 'availability') {
    const display = `${value.toFixed(2)}%`
    if (format === 'md') return display
    if (value >= 99.9) return chalk.green(display)
    if (value >= 99) return chalk.yellow(display)
    return chalk.red(display)
  }

  // Metric names containing timing info — format as ms
  const unit = findUnit(key)
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

  // Generic number
  return value.toFixed(2)
}

export function formatMetricLabel (key: string): string {
  // Turn responseTime_avg into "Response Time (avg)"
  const parts = key.split('_')
  if (parts.length >= 2) {
    const aggregation = parts.pop()!
    const metricName = parts.join(' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim()
    return `${metricName} (${aggregation})`
  }
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()
}

export function formatAnalyticsSection (
  response: AnalyticsResponse | undefined,
  range: string,
  format: OutputFormat,
): string {
  if (!response) return ''

  const metrics = extractMetrics(response)
  const metricKeys = Object.keys(metrics)
  if (metricKeys.length === 0) return ''

  const entries = metricKeys.map(key => ({
    label: formatMetricLabel(key),
    value: formatMetricValue(key, metrics[key], format),
  }))

  if (format === 'md') {
    const lines = [
      `## Stats (${range})`,
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

  const lines = [chalk.bold('STATS') + ' ' + chalk.dim(`(${range})`), '']
  for (const { label, value } of entries) {
    const labelStr = `${label}:`
    const padding = ' '.repeat(padWidth - labelStr.length)
    lines.push(`  ${chalk.dim(labelStr)}${padding}${value}`)
  }

  return lines.join('\n')
}
