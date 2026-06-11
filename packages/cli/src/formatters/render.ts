import chalk from 'chalk'
import stringWidth from 'string-width'

export type OutputFormat = 'terminal' | 'md'

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\u001B\[[0-9;]*m/g

export function stripAnsi (value: string): string {
  return value.replace(ANSI_REGEX, '')
}

export function escapeMdCell (value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export function visWidth (value: string): number {
  return stringWidth(stripAnsi(value))
}

const RIGHT_ALIGN_GAP = 2

export function padColumn (value: string, width: number, align: 'left' | 'right' = 'left', trailingGap = true): string {
  if (align === 'right') {
    const gap = trailingGap ? RIGHT_ALIGN_GAP : 0
    const contentWidth = width - gap
    const leadPad = Math.max(0, contentWidth - visWidth(value))
    return ' '.repeat(leadPad) + value + ' '.repeat(gap)
  }
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

export function truncateSingleLine (text: string, max: number): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= max) return singleLine
  return singleLine.slice(0, max - 3) + '...'
}

// --- Typed field/column definitions ---

export interface DetailField<T> {
  label: string
  value: (item: T, format: OutputFormat) => string | null
}

export interface ColumnDef<T> {
  header: string
  width?: number
  minWidth?: number
  maxWidth?: number
  truncate?: boolean
  align?: 'left' | 'right'
  value: (item: T, format: OutputFormat) => string
}

export interface AdaptiveTableOptions {
  terminalWidth?: number
}

export interface CommandHint {
  label: string
  command: string
}

export interface CommandHintsOptions {
  gap?: number
  indent?: number
}

export function renderCommandHints (hints: CommandHint[], options: CommandHintsOptions = {}): string {
  if (hints.length === 0) return ''

  const indent = ' '.repeat(options.indent ?? 2)
  const gap = ' '.repeat(options.gap ?? 2)
  const labelWidth = Math.max(...hints.map(hint => visWidth(`${hint.label}:`)))

  return hints
    .map(hint => {
      const label = padColumn(`${hint.label}:`, labelWidth, 'left', false)
      return `${indent}${chalk.dim(label)}${gap}${hint.command}`
    })
    .join('\n')
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
        lines.push(`| ${field.label} | ${escapeMdCell(val)} |`)
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
  const indent = ' '.repeat(padWidth)
  for (const { label: lbl, value } of resolved) {
    const labelStr = `${lbl}:`
    const padding = ' '.repeat(padWidth - labelStr.length)
    const [first, ...rest] = value.split('\n')
    lines.push(`${chalk.dim(labelStr)}${padding}${first}`, ...rest.map(l => `${indent}${l}`))
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
    const separator = '| ' + columns.map(c => c.align === 'right' ? '---:' : '---').join(' | ') + ' |'
    const dataRows = rows.map(row =>
      '| ' + columns.map(c => escapeMdCell(c.value(row, format))).join(' | ') + ' |',
    )
    return [header, separator, ...dataRows].join('\n')
  }

  // Terminal
  const lastIdx = columns.length - 1
  const headerParts = columns.map((col, i) => {
    const text = chalk.bold(col.header.toUpperCase())
    if (!col.width) return text
    if (i === lastIdx && col.align !== 'right') return text
    return padColumn(text, col.width, col.align, i < lastIdx)
  })

  const dataRows = rows.map(row =>
    columns.map((col, i) => {
      const val = col.value(row, format)
      if (!col.width) return val
      if (i === lastIdx && col.align !== 'right') return val
      return padColumn(val, col.width, col.align, i < lastIdx)
    }).join(''),
  )

  return [headerParts.join(''), ...dataRows].join('\n')
}

function naturalColumnWidth (header: string, values: string[], trailingGap: boolean): number {
  const contentWidth = Math.max(visWidth(header.toUpperCase()), ...values.map(visWidth))
  return contentWidth + (trailingGap ? RIGHT_ALIGN_GAP : 0)
}

function shrinkToFit (widths: number[], minWidths: number[], overage: number): void {
  let remaining = overage

  while (remaining > 0) {
    const shrinkable = widths
      .map((width, index) => ({ index, room: width - minWidths[index] }))
      .filter(col => col.room > 0)

    if (shrinkable.length === 0) break

    let shrunk = 0
    for (const col of shrinkable) {
      const reduction = Math.min(col.room, 1)
      widths[col.index] -= reduction
      remaining -= reduction
      shrunk += reduction
      if (remaining === 0) break
    }

    if (shrunk === 0) break
  }
}

function resolveAdaptiveWidths<T> (
  columns: ColumnDef<T>[],
  resolvedRows: string[][],
  terminalWidth: number,
): number[] {
  const lastIdx = columns.length - 1
  const widths: number[] = []
  const minWidths: number[] = []

  for (const [index, column] of columns.entries()) {
    const trailingGap = index < lastIdx
    if (column.width != null) {
      widths[index] = column.width
      minWidths[index] = column.width
      continue
    }

    const values = resolvedRows.map(row => row[index])
    const natural = naturalColumnWidth(column.header, values, trailingGap)
    const min = column.minWidth ?? natural
    const max = column.maxWidth ?? Number.POSITIVE_INFINITY
    widths[index] = Math.max(min, Math.min(natural, max))
    minWidths[index] = min
  }

  const total = () => widths.reduce((sum, width) => sum + width, 0)
  const overage = total() - terminalWidth

  if (overage > 0) {
    shrinkToFit(widths, minWidths, overage)
  }

  return widths
}

function formatAdaptiveCell<T> (
  value: string,
  column: ColumnDef<T>,
  width: number,
  columnIndex: number,
  lastIndex: number,
): string {
  const trailingGap = columnIndex < lastIndex
  const shouldTruncate = column.truncate ?? column.width == null
  let display = value

  if (shouldTruncate) {
    const gap = column.align === 'right' ? 0 : (trailingGap ? RIGHT_ALIGN_GAP : 0)
    display = truncateToWidth(display, Math.max(1, width - gap))
  }

  if (columnIndex === lastIndex && column.align !== 'right') return display
  return padColumn(display, width, column.align, trailingGap)
}

export function renderAdaptiveTable<T> (
  columns: ColumnDef<T>[],
  rows: T[],
  format: OutputFormat,
  options: AdaptiveTableOptions = {},
): string {
  if (format === 'md') return renderTable(columns, rows, format)

  const resolvedRows = rows.map(row => columns.map(col => col.value(row, format)))
  const terminalWidth = options.terminalWidth ?? (process.stdout.columns || 120)
  const widths = resolveAdaptiveWidths(columns, resolvedRows, terminalWidth)
  const lastIdx = columns.length - 1

  const headerParts = columns.map((col, i) =>
    formatAdaptiveCell(chalk.bold(col.header.toUpperCase()), col, widths[i], i, lastIdx),
  )

  const dataRows = resolvedRows.map(row =>
    row.map((value, i) =>
      formatAdaptiveCell(value, columns[i], widths[i], i, lastIdx),
    ).join(''),
  )

  return [headerParts.join(''), ...dataRows].join('\n')
}
