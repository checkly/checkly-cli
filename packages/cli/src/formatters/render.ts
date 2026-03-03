import chalk from 'chalk'
import stringWidth from 'string-width'

export type OutputFormat = 'terminal' | 'md'

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\u001B\[[0-9;]*m/g

export function stripAnsi (value: string): string {
  return value.replace(ANSI_REGEX, '')
}

export function visWidth (value: string): number {
  return stringWidth(stripAnsi(value))
}

export function padColumn (value: string, width: number): string {
  const padding = Math.max(0, width - visWidth(value))
  return value + ' '.repeat(padding)
}

export function truncateToWidth (value: string, maxWidth: number): string {
  const stripped = stripAnsi(value)
  if (visWidth(stripped) <= maxWidth) return value
  let result = ''
  let width = 0
  for (const char of stripped) {
    const charWidth = stringWidth(char)
    if (width + charWidth + 1 > maxWidth) break
    result += char
    width += charWidth
  }
  return result + '…'
}

export function heading (text: string, level: number, format: OutputFormat): string {
  if (format === 'md') return `${'#'.repeat(level)} ${text}`
  return chalk.bold(text)
}

export function formatMs (ms: number): string {
  const rounded = Math.round(ms)
  if (rounded < 1000) return `${rounded}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function timeAgo (dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths}mo ago`
}

export function formatFrequency (minutes: number | undefined | null): string {
  if (minutes === undefined || minutes === null) return '-'
  if (minutes === 0) return '<1m'
  if (minutes < 60) return `${minutes}m`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}

export function formatCheckType (checkType: string): string {
  return checkType
}

export function formatDate (dateStr: string | null | undefined, format: OutputFormat): string {
  if (!dateStr) return format === 'terminal' ? chalk.dim('-') : '-'
  const d = new Date(dateStr)
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

export function resolveResultStatus (
  result: { hasErrors: boolean, hasFailures: boolean, isDegraded: boolean | null },
  format: OutputFormat,
): string {
  const label = result.hasErrors ? 'error' : result.hasFailures ? 'failing' : result.isDegraded ? 'degraded' : 'passing'
  if (format === 'md') return label
  if (label === 'error' || label === 'failing') return chalk.red(label)
  if (label === 'degraded') return chalk.yellow(label)
  return chalk.green(label)
}

export function truncateError (msg: string, maxLen: number): string {
  const clean = stripAnsi(msg).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLen) return clean
  return clean.substring(0, maxLen - 1) + '…'
}

// --- Typed field/column definitions ---

export interface DetailField<T> {
  label: string
  value: (item: T, format: OutputFormat) => string | null
}

export interface ColumnDef<T> {
  header: string
  width?: number
  value: (item: T, format: OutputFormat) => string
}

export function renderDetailFields<T> (
  title: string,
  fields: DetailField<T>[],
  item: T,
  format: OutputFormat,
): string {
  if (format === 'md') {
    const lines = [
      `# ${title}`,
      '',
      '| Field | Value |',
      '| --- | --- |',
    ]
    for (const field of fields) {
      const val = field.value(item, format)
      if (val != null) {
        lines.push(`| ${field.label} | ${val} |`)
      }
    }
    return lines.join('\n')
  }

  // Terminal: compute visible fields, then align labels
  const resolved: Array<{ label: string, value: string }> = []
  for (const field of fields) {
    const val = field.value(item, format)
    if (val != null) {
      resolved.push({ label: field.label, value: val })
    }
  }

  const maxLabelLen = Math.max(0, ...resolved.map(f => f.label.length))
  const padWidth = maxLabelLen + 3 // "label:" + at least 2 spaces

  const lines = [chalk.bold(title), '']
  for (const { label: lbl, value } of resolved) {
    const labelStr = `${lbl}:`
    const padding = ' '.repeat(padWidth - labelStr.length)
    lines.push(`${chalk.dim(labelStr)}${padding}${value}`)
  }

  return lines.join('\n')
}

export function renderTable<T> (
  columns: ColumnDef<T>[],
  rows: T[],
  format: OutputFormat,
): string {
  if (format === 'md') {
    const header = '| ' + columns.map(c => c.header).join(' | ') + ' |'
    const separator = '| ' + columns.map(() => '---').join(' | ') + ' |'
    const dataRows = rows.map(row =>
      '| ' + columns.map(c => c.value(row, format)).join(' | ') + ' |',
    )
    return [header, separator, ...dataRows].join('\n')
  }

  // Terminal
  const headerParts = columns.map((col, i) => {
    const text = chalk.bold(col.header.toUpperCase())
    return (i < columns.length - 1 && col.width) ? padColumn(text, col.width) : text
  })

  const dataRows = rows.map(row =>
    columns.map((col, i) => {
      const val = col.value(row, format)
      return (i < columns.length - 1 && col.width) ? padColumn(val, col.width) : val
    }).join(''),
  )

  return [headerParts.join(''), ...dataRows].join('\n')
}
