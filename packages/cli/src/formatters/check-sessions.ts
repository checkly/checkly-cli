import chalk from 'chalk'

import type { CheckSession, CheckSessionStatus } from '../rest/check-sessions.js'
import {
  type ColumnDef,
  type OutputFormat,
  formatCheckType,
  renderAdaptiveTable,
  renderCommandHints,
} from './render.js'

function formatStatus (status: CheckSessionStatus, format: OutputFormat): string {
  const label = status.toLowerCase().replace(/_/g, ' ')
  if (format === 'md') return label

  switch (status) {
    case 'PASSED':
      return chalk.green(label)
    case 'DEGRADED':
    case 'PROGRESS':
    case 'PROGRESS_DEGRADED':
    case 'STARTED':
      return chalk.yellow(label)
    case 'FAILED':
    case 'PROGRESS_FAILED':
    case 'TIMED_OUT':
      return chalk.red(label)
    case 'CANCELLED':
      return chalk.dim(label)
  }
}

function formatDuration (milliseconds: number, format: OutputFormat): string {
  if (milliseconds <= 0) return format === 'terminal' ? chalk.dim('-') : '-'
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`

  const totalSeconds = Math.round(milliseconds / 1_000)
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

function formatLocations (locations: string[], format: OutputFormat): string {
  if (locations.length === 0) return format === 'terminal' ? chalk.dim('-') : '-'
  return locations.join(', ')
}

function buildColumns (format: OutputFormat): ColumnDef<CheckSession>[] {
  if (format === 'md') {
    return [
      { header: 'Status', value: (session, fmt) => formatStatus(session.status, fmt) },
      { header: 'Name', value: session => session.name ?? '-' },
      { header: 'Type', value: session => formatCheckType(session.checkType) },
      { header: 'Locations', value: (session, fmt) => formatLocations(session.runLocations, fmt) },
      { header: 'Duration', value: (session, fmt) => formatDuration(session.timeElapsed, fmt) },
      { header: 'Check ID', value: session => session.checkId },
      {
        header: 'Session ID',
        value: session => `[${session.checkSessionId}](${session.checkSessionLink})`,
      },
    ]
  }

  return [
    { header: 'Status', minWidth: 11, maxWidth: 18, value: (session, fmt) => formatStatus(session.status, fmt) },
    { header: 'Name', minWidth: 18, maxWidth: 42, value: session => session.name ?? chalk.dim('-') },
    { header: 'Type', minWidth: 10, maxWidth: 14, value: session => formatCheckType(session.checkType) },
    {
      header: 'Locations',
      minWidth: 14,
      maxWidth: 30,
      value: (session, fmt) => formatLocations(session.runLocations, fmt),
    },
    { header: 'Duration', minWidth: 10, maxWidth: 12, value: (session, fmt) => formatDuration(session.timeElapsed, fmt) },
    { header: 'Check ID', minWidth: 12, maxWidth: 38, value: session => chalk.dim(session.checkId) },
    { header: 'Session ID', minWidth: 12, maxWidth: 38, value: session => chalk.dim(session.checkSessionId) },
  ]
}

function formatSummary (sessions: CheckSession[], detached: boolean): string {
  const count = sessions.length
  const noun = `check session${count === 1 ? '' : 's'}`
  if (detached) return `${count} ${noun} started.`

  const statuses = new Map<CheckSessionStatus, number>()
  for (const session of sessions) {
    statuses.set(session.status, (statuses.get(session.status) ?? 0) + 1)
  }
  const summary = [...statuses.entries()]
    .map(([status, statusCount]) => `${statusCount} ${status.toLowerCase().replace(/_/g, ' ')}`)
    .join(', ')
  return `${count} ${noun} completed: ${summary}.`
}

export function formatCheckSessionsRun (
  sessions: CheckSession[],
  format: OutputFormat,
  options: { detached: boolean },
): string {
  const summary = formatSummary(sessions, options.detached)
  const alertingNote = 'Configured alerting rules apply to these check runs.'
  const table = renderAdaptiveTable(buildColumns(format), sessions, format)

  if (format === 'md') {
    return [
      '# Check sessions',
      '',
      summary,
      '',
      `> ${alertingNote}`,
      '',
      table,
    ].join('\n')
  }

  const hints = renderCommandHints([
    { label: 'Inspect check', command: 'checkly checks get <check-id>' },
    { label: sessions.length === 1 ? 'Open session' : 'Open first session', command: sessions[0].checkSessionLink },
  ], { gap: 3 })

  return [summary, chalk.dim(alertingNote), '', table, '', hints].join('\n')
}
