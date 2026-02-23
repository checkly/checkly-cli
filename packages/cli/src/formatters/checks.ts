import chalk from 'chalk'
import logSymbols from 'log-symbols'
import type { Check } from '../rest/checks'
import type { CheckStatus } from '../rest/check-statuses'
import type { CheckResult } from '../rest/check-results'
import type { ErrorGroup } from '../rest/error-groups'
import {
  type OutputFormat,
  type DetailField,
  type ColumnDef,
  truncateToWidth,
  visWidth,
  formatFrequency,
  formatCheckType,
  formatMs,
  timeAgo,
  stripAnsi,
  truncateError,
  resolveResultStatus,
  renderDetailFields,
  renderTable,
} from './render'

export { formatFrequency, formatCheckType } from './render'

export type CheckWithStatus = Check & { status?: CheckStatus }

export interface PaginationInfo {
  page: number
  limit: number
  total: number
}

function resolveStatus (check: CheckWithStatus, format: OutputFormat): string {
  if (!check.activated) return format === 'terminal' ? chalk.dim('inactive') : 'inactive'
  if (!check.status) return format === 'terminal' ? chalk.dim('-') : 'unknown'
  const failing = check.status.hasFailures || check.status.hasErrors
  const degraded = check.status.isDegraded
  const muted = check.muted

  if (format === 'md') {
    const label = failing ? 'failing' : degraded ? 'degraded' : 'passing'
    return muted ? `${label} (muted)` : label
  }

  if (failing) return muted ? chalk.dim('failing') : chalk.red('failing')
  if (degraded) return muted ? chalk.dim('degraded') : chalk.yellow('degraded')
  return muted ? chalk.dim('passing') : chalk.green('passing')
}

function boolSymbol (value: boolean, format: OutputFormat): string {
  if (format === 'md') return value ? 'yes' : '-'
  return value ? chalk.green('yes') : chalk.dim('-')
}

// --- Summary bar (terminal only) ---

export function formatSummaryBar (statuses: CheckStatus[], totalChecks: number, activeCheckIds?: Set<string>): string {
  const counted = activeCheckIds
    ? statuses.filter(s => activeCheckIds.has(s.checkId))
    : statuses
  const passing = counted.filter(s => !s.hasFailures && !s.hasErrors && !s.isDegraded).length
  const degraded = counted.filter(s => s.isDegraded && !s.hasFailures && !s.hasErrors).length
  const failing = counted.filter(s => s.hasFailures || s.hasErrors).length

  const parts: string[] = []
  if (passing > 0) parts.push(chalk.green(`${logSymbols.success} ${passing} passing`))
  if (degraded > 0) parts.push(chalk.yellow(`${logSymbols.warning} ${degraded} degraded`))
  if (failing > 0) parts.push(chalk.red(`${logSymbols.error} ${failing} failing`))

  const total = chalk.dim(`(${totalChecks} total checks)`)
  return parts.join('    ') + '    ' + total
}

// --- Pagination info (terminal only) ---

export function formatPaginationInfo (pagination: PaginationInfo): string {
  const { page, limit, total } = pagination
  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  const totalPages = Math.ceil(total / limit)

  return chalk.dim(`Showing ${start}-${end} of ${total} checks (page ${page}/${totalPages})`)
}

// --- Navigation hints (terminal only) ---

export function formatNavigationHints (pagination: PaginationInfo, activeFilters: string[]): string {
  const { page, limit, total } = pagination
  const totalPages = Math.ceil(total / limit)
  const lines: string[] = []

  if (page < totalPages) {
    lines.push(`  ${chalk.dim('Next page:')}    checkly checks list --page ${page + 1}`)
  }
  if (page > 1) {
    lines.push(`  ${chalk.dim('Prev page:')}    checkly checks list --page ${page - 1}`)
  }
  lines.push(`  ${chalk.dim('View check:')}   checkly checks get <id>`)
  if (activeFilters.length === 0) {
    lines.push(`  ${chalk.dim('Filter:')}       checkly checks list --tag <tag> --type <type> --search <name>`)
  }

  return lines.join('\n')
}

// --- Check detail fields ---

export const checkDetailFields: DetailField<CheckWithStatus>[] = [
  { label: 'Type', value: c => formatCheckType(c.checkType) },
  { label: 'Status', value: (c, fmt) => resolveStatus(c, fmt) },
  { label: 'Active', value: (c, fmt) => boolSymbol(c.activated, fmt) },
  { label: 'Muted', value: (c, fmt) => boolSymbol(c.muted, fmt) },
  { label: 'Frequency', value: c => `Every ${formatFrequency(c.frequency)}` },
  {
    label: 'Locations',
    value: (c, fmt) => {
      const locations = [
        ...(c.locations || []),
        ...(c.privateLocations || []).map(l => `${l} (private)`),
      ]
      if (locations.length === 0) return fmt === 'terminal' ? chalk.dim('-') : '-'
      return locations.join(', ')
    },
  },
  {
    label: 'Tags',
    value: (c, fmt) => {
      if (c.tags.length === 0) return fmt === 'terminal' ? chalk.dim('-') : '-'
      return c.tags.join(', ')
    },
  },
  {
    label: 'Source',
    value: (c, fmt) => {
      if (fmt === 'md') return null
      if (c.scriptPath) return `${chalk.cyan('code')} ${chalk.dim('→')} ${c.scriptPath}`
      return chalk.dim('UI')
    },
  },
  {
    label: 'URL',
    value: (c, fmt) => {
      if (fmt === 'md') return null
      return c.request?.url ?? null
    },
  },
  {
    label: 'SSL',
    value: (c, fmt) => {
      if (c.status?.sslDaysRemaining == null) {
        return fmt === 'md' ? '-' : null
      }
      const ssl = c.status.sslDaysRemaining
      const display = `${ssl} days remaining`
      if (fmt === 'md') return display
      return ssl <= 14 ? chalk.red(display) : ssl <= 30 ? chalk.yellow(display) : chalk.green(display)
    },
  },
  {
    label: 'Deployed',
    value: (c, fmt) => {
      if (!c.updated_at) return fmt === 'md' ? '-' : null
      return new Date(c.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    },
  },
  {
    label: 'Group',
    value: (c, fmt) => c.groupId != null ? String(c.groupId) : (fmt === 'terminal' ? chalk.dim('-') : '-'),
  },
  {
    label: 'Created',
    value: (c, fmt) => {
      if (!c.created_at) return fmt === 'terminal' ? chalk.dim('-') : '-'
      return new Date(c.created_at).toISOString().slice(0, 10)
    },
  },
  { label: 'ID', value: c => c.id },
]

export function formatCheckDetail (check: CheckWithStatus, format: OutputFormat): string {
  return renderDetailFields(check.name, checkDetailFields, check, format)
}

// --- Checks table ---

export interface TableOptions {
  showId?: boolean
}

function buildCheckColumns (
  checks: CheckWithStatus[], format: OutputFormat, options: TableOptions = {},
): ColumnDef<CheckWithStatus>[] {
  if (format === 'md') {
    return [
      { header: 'Name', value: c => c.name },
      { header: 'Type', value: c => formatCheckType(c.checkType) },
      { header: 'Status', value: (c, fmt) => resolveStatus(c, fmt) },
      { header: 'Freq', value: c => formatFrequency(c.frequency) },
      { header: 'Tags', value: c => c.tags.length > 0 ? c.tags.join(', ') : '-' },
      { header: 'ID', value: c => c.id },
    ]
  }

  const { showId = false } = options
  const termWidth = process.stdout.columns || 120
  const fixedWidth = 12 + 10 + 6
  const idReserve = showId ? 38 : 0
  const available = termWidth - fixedWidth - idReserve
  const longestName = Math.max(4, ...checks.map(c => visWidth(c.name)))
  const nameWidth = Math.min(longestName + 2, 42)
  const tagWidth = Math.max(8, available - nameWidth)

  const columns: ColumnDef<CheckWithStatus>[] = [
    {
      header: 'Name',
      width: nameWidth,
      value: c => truncateToWidth(c.name, nameWidth - 2),
    },
    {
      header: 'Type',
      width: 12,
      value: c => formatCheckType(c.checkType),
    },
    {
      header: 'Status',
      width: 10,
      value: (c, fmt) => resolveStatus(c, fmt),
    },
    {
      header: 'Freq',
      width: 6,
      value: c => formatFrequency(c.frequency),
    },
  ]

  columns.push({
    header: 'Tags',
    ...(showId && { width: tagWidth }),
    value: c => {
      const tags = c.tags.length > 0 ? c.tags.join(', ') : chalk.dim('-')
      return truncateToWidth(tags, tagWidth - 2)
    },
  })
  if (showId) {
    columns.push({ header: 'ID', value: c => chalk.dim(c.id) })
  }

  return columns
}

export function formatChecks (
  checks: CheckWithStatus[], format: OutputFormat,
  options: TableOptions & { pagination?: PaginationInfo } = {},
): string {
  const columns = buildCheckColumns(checks, format, options)
  let result = renderTable(columns, checks, format)

  if (format === 'md' && options.pagination) {
    const { page, limit, total } = options.pagination
    const totalPages = Math.ceil(total / limit)
    result += `\n\n*Showing page ${page}/${totalPages} (${total} total checks)*`
  }

  return result
}

// --- Results table ---

function buildResultColumns (format: OutputFormat): ColumnDef<CheckResult>[] {
  if (format === 'md') {
    return [
      { header: 'Time', value: r => r.startedAt },
      { header: 'Location', value: r => r.runLocation },
      { header: 'Status', value: (r, fmt) => resolveResultStatus(r, fmt) },
      { header: 'Response Time', value: r => formatMs(r.responseTime) },
      { header: 'ID', value: r => r.id },
    ]
  }

  return [
    { header: 'Time', width: 14, value: r => timeAgo(r.startedAt) },
    { header: 'Location', width: 16, value: r => r.runLocation },
    { header: 'Status', width: 10, value: (r, fmt) => resolveResultStatus(r, fmt) },
    { header: 'Response Time', width: 16, value: r => formatMs(r.responseTime) },
    { header: 'Result ID', value: r => chalk.dim(r.id) },
  ]
}

export function formatResults (results: CheckResult[], format: OutputFormat): string {
  return renderTable(buildResultColumns(format), results, format)
}

// --- Error groups ---

function buildErrorGroupColumns (format: OutputFormat): ColumnDef<ErrorGroup>[] {
  if (format === 'md') {
    return [
      {
        header: 'Error',
        value: eg => {
          const msg = stripAnsi(eg.cleanedErrorMessage).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
          return msg.length > 80 ? msg.substring(0, 79) + '…' : msg
        },
      },
      { header: 'First Seen', value: eg => eg.firstSeen },
      { header: 'Last Seen', value: eg => eg.lastSeen },
      { header: 'ID', value: eg => eg.id },
    ]
  }

  return [
    {
      header: 'Error',
      width: 60,
      value: eg => chalk.red(truncateError(eg.cleanedErrorMessage, 58)),
    },
    {
      header: 'First Seen',
      width: 14,
      value: eg => chalk.dim(timeAgo(eg.firstSeen)),
    },
    {
      header: 'Last Seen',
      value: eg => chalk.dim(timeAgo(eg.lastSeen)),
    },
  ]
}

export function formatErrorGroups (errorGroups: ErrorGroup[], format: OutputFormat): string {
  const active = errorGroups.filter(eg => !eg.archivedUntilNextEvent)
  if (active.length === 0) return ''

  const columns = buildErrorGroupColumns(format)
  const title = format === 'md'
    ? '## Error Groups\n\n'
    : chalk.bold('ERROR GROUPS') + '\n'
  return title + renderTable(columns, active, format)
}
