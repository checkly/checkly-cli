import chalk from 'chalk'
import type { TestSessionErrorGroup } from '../rest/test-session-error-groups.js'
import type {
  TestSessionDetail,
  TestSessionListEntry,
  TestSessionMetadata,
  TestSessionResult,
  TestSessionStatus,
} from '../rest/test-sessions.js'
import {
  type ColumnDef,
  type DetailField,
  type OutputFormat,
  type CommandHint,
  formatCheckType,
  formatDate,
  renderCommandHints,
  renderDetailFields,
  renderAdaptiveTable,
} from './render.js'

const DEFAULT_ERROR_GROUPS_LIMIT = 5
const DEFAULT_ERROR_DETAIL_LINES = 80

export interface TestSessionFormatOptions {
  errorGroupsLimit?: number
}

export interface TestSessionErrorGroupFormatOptions {
  fullError?: boolean
  errorLines?: number
}

interface ErrorGroupReference {
  id: string
  sources: string[]
}

function formatStatus (status: TestSessionStatus, format: OutputFormat): string {
  const normalized = status.toLowerCase()
  if (format === 'md') return normalized

  switch (status) {
    case 'FAILED':
      return chalk.red(normalized)
    case 'CANCELLED':
      return chalk.dim(normalized)
    case 'RUNNING':
      return chalk.yellow(normalized)
    case 'PASSED':
      return chalk.green(normalized)
  }
}

function formatOptionalStatus (status: TestSessionStatus | undefined, format: OutputFormat): string {
  if (!status) return format === 'terminal' ? chalk.dim('-') : '-'
  return formatStatus(status, format)
}

function formatList (values: string[] | undefined, format: OutputFormat): string {
  if (!values || values.length === 0) return format === 'terminal' ? chalk.dim('-') : '-'
  return values.join(', ')
}

function formatErrorGroupCount (values: string[] | undefined, format: OutputFormat): string {
  if (format === 'md') return formatList(values, format)
  const count = values?.length ?? 0
  if (count === 0) return chalk.dim('-')
  return `${count} ${count === 1 ? 'group' : 'groups'}`
}

function formatErrorGroupSummary (session: TestSessionDetail, format: OutputFormat): string {
  const count = uniqueErrorGroupIds(session).length
  if (count === 0) return format === 'terminal' ? chalk.dim('-') : '-'
  return `${count} ${count === 1 ? 'group' : 'groups'}`
}

function formatDuration (ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`

  const totalSeconds = Math.round(ms / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes === 0) return `${seconds}s`

  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  if (hours === 0) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`

  if (minutes === 0 && seconds === 0) return `${hours}h`
  if (minutes === 0) return `${hours}h ${seconds}s`
  return seconds === 0 ? `${hours}h ${minutes}m` : `${hours}h ${minutes}m ${seconds}s`
}

function formatNullableString (value: string | null | undefined, format: OutputFormat): string {
  if (!value) return format === 'terminal' ? chalk.dim('-') : '-'
  return value
}

function formatResultBucketCount (values: string[] | null | undefined, format: OutputFormat): string {
  const count = values?.length ?? 0
  if (count === 0) return format === 'terminal' ? chalk.dim('-') : '-'
  return String(count)
}

function formatInvoker (session: TestSessionListEntry, format: OutputFormat): string {
  return formatNullableString(session.commitOwner ?? session.invoker?.name, format)
}

function buildTestSessionListColumns (format: OutputFormat): ColumnDef<TestSessionListEntry>[] {
  if (format === 'md') {
    return [
      { header: 'Status', value: (session, fmt) => formatOptionalStatus(session.status, fmt) },
      { header: 'Started', value: (session, fmt) => formatDate(session.startedAt, fmt) },
      { header: 'Name', value: session => session.name },
      { header: 'Provider', value: session => session.provider },
      { header: 'Branch', value: (session, fmt) => formatNullableString(session.branchName, fmt) },
      { header: 'User', value: (session, fmt) => formatInvoker(session, fmt) },
      { header: 'Running', value: (session, fmt) => formatResultBucketCount(session.running, fmt) },
      { header: 'Passed', value: (session, fmt) => formatResultBucketCount(session.passed, fmt) },
      { header: 'Failed', value: (session, fmt) => formatResultBucketCount(session.failed, fmt) },
      { header: 'Cancelled', value: (session, fmt) => formatResultBucketCount(session.cancelled, fmt) },
      { header: 'ID', value: session => session.id },
    ]
  }

  const statusWidth = 11
  const resultBucketWidth = 10

  return [
    { header: 'Status', width: statusWidth, value: (session, fmt) => formatOptionalStatus(session.status, fmt) },
    {
      header: 'Started',
      minWidth: 12,
      maxWidth: 25,
      value: (session, fmt) => formatDate(session.startedAt, fmt),
    },
    { header: 'Name', minWidth: 18, maxWidth: 42, value: session => session.name },
    { header: 'Provider', minWidth: 8, maxWidth: 13, value: session => session.provider },
    {
      header: 'Branch',
      minWidth: 8,
      maxWidth: 18,
      value: (session, fmt) => formatNullableString(session.branchName, fmt),
    },
    {
      header: 'User',
      minWidth: 8,
      maxWidth: 18,
      value: (session, fmt) => formatInvoker(session, fmt),
    },
    { header: 'Running', width: resultBucketWidth, value: (session, fmt) => formatResultBucketCount(session.running, fmt) },
    { header: 'Passed', width: resultBucketWidth, value: (session, fmt) => formatResultBucketCount(session.passed, fmt) },
    { header: 'Failed', width: resultBucketWidth, value: (session, fmt) => formatResultBucketCount(session.failed, fmt) },
    { header: 'Cancelled', width: resultBucketWidth, value: (session, fmt) => formatResultBucketCount(session.cancelled, fmt) },
    { header: 'ID', minWidth: 12, maxWidth: 38, value: session => chalk.dim(session.id) },
  ]
}

export function formatTestSessionsList (
  sessions: TestSessionListEntry[],
  format: OutputFormat,
): string {
  return renderAdaptiveTable(buildTestSessionListColumns(format), sessions, format)
}

export function formatTestSessionsListPaginationInfo (count: number, nextId: string | null | undefined): string {
  const base = `${count} test session${count !== 1 ? 's' : ''}`
  if (nextId) {
    return chalk.dim(`Showing ${base} (more available)`)
  }
  return chalk.dim(`Showing ${base}`)
}

export function formatTestSessionsListNavigationHints (
  nextId: string | null | undefined,
  listCommand: string,
  firstSessionId?: string,
): string {
  const hints: CommandHint[] = []
  if (nextId) {
    hints.push({ label: 'Next page', command: `${listCommand} --cursor ${nextId}` })
  }
  if (firstSessionId) {
    hints.push({ label: 'Inspect session', command: `checkly test-sessions get ${firstSessionId}` })
  }
  return renderCommandHints(hints, { gap: 1 })
}

function formatMetadata (metadata: TestSessionMetadata | undefined, format: OutputFormat): string | null {
  if (!metadata) return null

  const entries = Object.entries(metadata).filter(([, value]) => value != null && value !== '')
  if (entries.length === 0) return null

  const labels: Record<string, string> = {
    environment: 'environment',
    repoUrl: 'repo',
    commitId: 'commit',
    commitOwner: 'author',
    commitMessage: 'message',
    branchName: 'branch',
  }

  const formatted = entries.map(([key, value]) => `${labels[key] ?? key}: ${value}`)
  return format === 'md' ? formatted.join(', ') : formatted.join('\n')
}

const testSessionDetailFields: DetailField<TestSessionDetail>[] = [
  { label: 'Status', value: (session, fmt) => formatStatus(session.status, fmt) },
  { label: 'Started', value: (session, fmt) => formatDate(session.startedAt, fmt) },
  { label: 'Stopped', value: (session, fmt) => formatDate(session.stoppedAt, fmt) },
  { label: 'Time elapsed', value: session => formatDuration(session.timeElapsed) },
  { label: 'Metadata', value: (session, fmt) => formatMetadata(session.metadata, fmt) },
  { label: 'Session link', value: (session, fmt) => fmt === 'md' ? session.testSessionLink : null },
  { label: 'Error groups', value: (session, fmt) => formatErrorGroupSummary(session, fmt) },
  { label: 'ID', value: session => session.testSessionId },
]

function buildResultColumns (results: TestSessionResult[], format: OutputFormat): ColumnDef<TestSessionResult>[] {
  if (format === 'md') {
    return [
      { header: 'Result ID', value: result => result.testSessionResultId },
      { header: 'Check ID', value: result => result.checkId ?? '-' },
      { header: 'Name', value: result => result.name || '-' },
      { header: 'Check Type', value: result => formatCheckType(result.checkType) },
      { header: 'Status', value: (result, fmt) => formatStatus(result.status, fmt) },
      { header: 'Result Type', value: result => result.resultType ?? '-' },
      { header: 'Run Location', value: result => result.runLocation ?? '-' },
      { header: 'Error Groups', value: (result, fmt) => formatList(result.errorGroupIds, fmt) },
    ]
  }

  const showCheckId = results.some(result => result.checkId)
  const typeWidth = 14
  const statusWidth = 10
  const resultTypeWidth = 10
  const errorGroupWidth = 14

  const columns: ColumnDef<TestSessionResult>[] = [
    { header: 'Name', minWidth: 12, maxWidth: 42, value: result => result.name || '-' },
    { header: 'Type', width: typeWidth, value: result => formatCheckType(result.checkType) },
    { header: 'Status', width: statusWidth, value: (result, fmt) => formatStatus(result.status, fmt) },
    { header: 'Result', width: resultTypeWidth, value: result => result.resultType ?? chalk.dim('-') },
    { header: 'Location', minWidth: 11, maxWidth: 14, value: result => result.runLocation ?? chalk.dim('-') },
    { header: 'Error Groups', width: errorGroupWidth, value: (result, fmt) => formatErrorGroupCount(result.errorGroupIds, fmt) },
  ]

  if (showCheckId) {
    columns.push(
      { header: 'Result ID', minWidth: 38, maxWidth: 38, value: result => chalk.dim(result.testSessionResultId) },
      { header: 'Check ID', minWidth: 8, maxWidth: 38, value: result => result.checkId ? chalk.dim(result.checkId) : chalk.dim('-') },
    )
  } else {
    columns.push({ header: 'Result ID', minWidth: 38, maxWidth: 38, value: result => chalk.dim(result.testSessionResultId) })
  }

  return columns
}

export function uniqueErrorGroupIds (session: TestSessionDetail): string[] {
  return [
    ...(session.errorGroupIds ?? []),
    ...(session.results ?? []).flatMap(result => result.errorGroupIds ?? []),
  ].filter((id, index, ids) => ids.indexOf(id) === index)
}

function errorGroupReferences (session: TestSessionDetail): ErrorGroupReference[] {
  const refs = new Map<string, Set<string>>()
  const add = (id: string, source: string) => {
    const sources = refs.get(id) ?? new Set<string>()
    sources.add(source)
    refs.set(id, sources)
  }

  for (const id of session.errorGroupIds ?? []) {
    add(id, 'session')
  }

  for (const result of session.results ?? []) {
    const source = result.name || result.testSessionResultId
    for (const id of result.errorGroupIds ?? []) {
      add(id, source)
    }
  }

  return [...refs.entries()].map(([id, sources]) => ({ id, sources: [...sources] }))
}

function buildErrorGroupReferenceColumns (format: OutputFormat): ColumnDef<ErrorGroupReference>[] {
  if (format === 'md') {
    return [
      { header: 'Source', value: ref => ref.sources.join(', ') },
      { header: 'Error Group ID', value: ref => ref.id },
    ]
  }

  return [
    {
      header: 'Source',
      minWidth: 16,
      maxWidth: 50,
      value: ref => ref.sources.join(', '),
    },
    { header: 'Error Group ID', minWidth: 12, maxWidth: 38, value: ref => chalk.dim(ref.id) },
  ]
}

export function formatTestSessionErrorGroupIds (
  session: TestSessionDetail,
  format: OutputFormat,
  options: TestSessionFormatOptions = {},
): string {
  const refs = errorGroupReferences(session)
  if (refs.length === 0) return ''

  const limit = Math.max(0, options.errorGroupsLimit ?? DEFAULT_ERROR_GROUPS_LIMIT)
  if (limit === 0) return ''

  const visible = refs.slice(0, limit)
  const hiddenCount = refs.length - visible.length
  const lines: string[] = [
    format === 'md' ? '## Error Group IDs' : chalk.bold('ERROR GROUP IDS'),
    '',
    renderAdaptiveTable(buildErrorGroupReferenceColumns(format), visible, format),
  ]

  if (hiddenCount > 0) {
    const showMoreCommand = `checkly test-sessions get ${session.testSessionId} --error-groups-limit ${refs.length}`
    lines.push('')
    lines.push(format === 'md'
      ? `*Showing ${visible.length} of ${refs.length} error group IDs. Show all: \`${showMoreCommand}\`*`
      : `${chalk.dim(`Showing ${visible.length} of ${refs.length} error group IDs. Show all:`)}  ${showMoreCommand}`)
  }

  return lines.join('\n')
}

export function formatTestSessionHints (session: TestSessionDetail, format: OutputFormat): string {
  const lines: string[] = []
  const errorGroupIds = uniqueErrorGroupIds(session)

  if (errorGroupIds.length > 0) {
    const inspectCommand = `checkly test-sessions get ${session.testSessionId} --error-group <error-group-id>`
    const rcaCommand = 'checkly rca run --test-session-error-group <error-group-id> --watch'
    lines.push(format === 'md'
      ? `- Inspect group: \`${inspectCommand}\``
      : `  ${chalk.dim('Inspect group:')}  ${inspectCommand}`)
    lines.push(format === 'md'
      ? `- Run RCA: \`${rcaCommand}\``
      : `  ${chalk.dim('Run RCA:')}       ${rcaCommand}`)
  }

  if (session.testSessionLink) {
    lines.push(format === 'md'
      ? `- Open session: ${session.testSessionLink}`
      : `  ${chalk.dim('Open session:')}  ${session.testSessionLink}`)
  }

  return lines.join('\n')
}

function formatRawErrorMessage (
  rawErrorMessage: string | null,
  format: OutputFormat,
  options: TestSessionErrorGroupFormatOptions,
): string | null {
  if (!rawErrorMessage) return null
  if (options.fullError) return rawErrorMessage

  const maxLines = Math.max(1, options.errorLines ?? DEFAULT_ERROR_DETAIL_LINES)
  const lines = rawErrorMessage.split('\n')
  if (lines.length <= maxLines) return rawErrorMessage

  const note = `Showing first ${maxLines} of ${lines.length} lines. Use --full-error to print the complete raw error.`
  const formattedNote = format === 'md' ? `_${note}_` : chalk.dim(note)
  return [...lines.slice(0, maxLines), '', formattedNote].join('\n')
}

function testSessionErrorGroupDetailFields (
  options: TestSessionErrorGroupFormatOptions,
): DetailField<TestSessionErrorGroup>[] {
  return [
    { label: 'Error', value: (group, fmt) => formatRawErrorMessage(group.rawErrorMessage, fmt, options) },
    { label: 'First seen', value: (group, fmt) => formatDate(group.firstSeen, fmt) },
    { label: 'Last seen', value: (group, fmt) => formatDate(group.lastSeen, fmt) },
    { label: 'Archived', value: group => group.archivedUntilNextEvent ? 'yes' : 'no' },
    { label: 'Project ID', value: group => group.projectId },
    { label: 'Environments', value: (group, fmt) => formatList(group.environments, fmt) },
    { label: 'Error hash', value: group => group.errorHash },
    { label: 'ID', value: group => group.id },
  ]
}

export function formatTestSessionErrorGroupDetail (
  group: TestSessionErrorGroup,
  format: OutputFormat,
  options: TestSessionErrorGroupFormatOptions = {},
): string {
  return renderDetailFields('Test session error group', testSessionErrorGroupDetailFields(options), group, format)
}

export function formatTestSessionDetail (
  session: TestSessionDetail,
  format: OutputFormat,
  options: TestSessionFormatOptions = {},
): string {
  const lines: string[] = [
    renderDetailFields(session.name, testSessionDetailFields, session, format),
  ]

  const results = session.results ?? []
  if (results.length > 0) {
    lines.push('')
    lines.push(format === 'md' ? '## Results' : chalk.bold('RESULTS'))
    lines.push('')
    lines.push(renderAdaptiveTable(buildResultColumns(results, format), results, format))
  }

  const errorGroupIds = formatTestSessionErrorGroupIds(session, format, options)
  if (errorGroupIds) {
    lines.push('')
    lines.push(errorGroupIds)
  }

  const hints = formatTestSessionHints(session, format)
  if (hints) {
    lines.push('')
    lines.push(format === 'md' ? '## Hints' : chalk.bold('HINTS'))
    lines.push('')
    lines.push(hints)
  }

  return lines.join('\n')
}
