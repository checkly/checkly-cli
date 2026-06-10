import chalk from 'chalk'
import type { IncidentUpdate, StatusPageIncident } from '../rest/incidents.js'
import {
  type OutputFormat,
  type ColumnDef,
  type DetailField,
  renderAdaptiveTable,
  renderDetailFields,
  formatDate,
  timeAgo,
} from './render.js'

function normalizeLabel (value: string): string {
  return value.toLowerCase()
}

function safeTimeAgo (dateStr: string | undefined | null): string {
  if (!dateStr) return '-'
  try {
    return timeAgo(dateStr)
  } catch {
    return '-'
  }
}

export function formatIncidentSeverity (severity: string, format: OutputFormat): string {
  const label = normalizeLabel(severity)
  if (format === 'md') return label
  switch (severity) {
    case 'CRITICAL':
      return chalk.red(label)
    case 'MAJOR':
      return chalk.yellow(label)
    case 'MEDIUM':
      return chalk.cyan(label)
    case 'MINOR':
      return chalk.dim(label)
    default:
      return chalk.dim(label)
  }
}

export function formatIncidentStatus (status: string, format: OutputFormat): string {
  const label = normalizeLabel(status)
  if (format === 'md') return label
  switch (status) {
    case 'RESOLVED':
      return chalk.green(label)
    case 'IDENTIFIED':
      return chalk.yellow(label)
    case 'MONITORING':
      return chalk.cyan(label)
    case 'INVESTIGATING':
      return chalk.yellow(label)
    default:
      return chalk.dim(label)
  }
}

function buildIncidentListColumns (format: OutputFormat): ColumnDef<StatusPageIncident>[] {
  if (format === 'md') {
    return [
      { header: 'Name', value: i => i.name },
      { header: 'Severity', value: i => formatIncidentSeverity(i.severity, format) },
      { header: 'Status', value: i => formatIncidentStatus(i.lastUpdateStatus, format) },
      { header: 'Services', value: i => String(i.services.length) },
      { header: 'Updated', value: i => formatDate(i.updated_at ?? i.created_at, format) },
      { header: 'ID', value: i => i.id },
    ]
  }

  return [
    {
      header: 'Name',
      minWidth: 12,
      maxWidth: 30,
      value: i => i.name,
    },
    {
      header: 'Severity',
      width: 11,
      value: i => formatIncidentSeverity(i.severity, format),
    },
    {
      header: 'Status',
      width: 15,
      value: i => formatIncidentStatus(i.lastUpdateStatus, format),
    },
    {
      header: 'Services',
      width: 10,
      value: i => String(i.services.length),
    },
    {
      header: 'Updated',
      width: 12,
      value: i => safeTimeAgo(i.updated_at ?? i.created_at),
    },
    {
      header: 'ID',
      value: i => chalk.dim(i.id),
    },
  ]
}

export function formatIncidentsList (incidents: StatusPageIncident[], format: OutputFormat): string {
  return renderAdaptiveTable(buildIncidentListColumns(format), incidents, format)
}

const incidentDetailFields: DetailField<StatusPageIncident>[] = [
  { label: 'Severity', value: (i, fmt) => formatIncidentSeverity(i.severity, fmt) },
  { label: 'Status', value: (i, fmt) => formatIncidentStatus(i.lastUpdateStatus, fmt) },
  { label: 'Services', value: i => String(i.services.length) },
  { label: 'Created', value: (i, fmt) => formatDate(i.created_at, fmt) },
  { label: 'Updated', value: (i, fmt) => formatDate(i.updated_at, fmt) },
  { label: 'ID', value: i => i.id },
]

function buildIncidentServiceColumns (format: OutputFormat): ColumnDef<{ name: string, id: string }>[] {
  if (format === 'md') {
    return [
      { header: 'Service', value: s => s.name },
      { header: 'ID', value: s => s.id },
    ]
  }

  return [
    { header: 'Service', minWidth: 10, maxWidth: 28, value: s => s.name },
    { header: 'ID', value: s => chalk.dim(s.id) },
  ]
}

export function formatIncidentDetail (incident: StatusPageIncident, format: OutputFormat): string {
  const lines: string[] = []
  lines.push(renderDetailFields(incident.name, incidentDetailFields, incident, format))

  if (incident.services.length > 0) {
    lines.push('')
    if (format === 'md') {
      lines.push('## Services')
      lines.push('')
    } else {
      lines.push(chalk.bold('SERVICES'))
    }
    lines.push(renderAdaptiveTable(buildIncidentServiceColumns(format), incident.services, format))
  }

  const latest = incident.incidentUpdates[0]
  if (latest) {
    lines.push('')
    if (format === 'md') {
      lines.push('## Latest Update')
      lines.push('')
      lines.push(`- Status: ${formatIncidentStatus(latest.status, format)}`)
      lines.push(`- Message: ${latest.description}`)
      const published = latest.publicIncidentUpdateDate ?? latest.created_at
      if (published) {
        lines.push(`- Published: ${formatDate(published, format)}`)
      }
    } else {
      lines.push(chalk.bold('LATEST UPDATE'))
      lines.push(`${chalk.dim('Status:')}  ${formatIncidentStatus(latest.status, format)}`)
      lines.push(`${chalk.dim('Message:')} ${latest.description}`)
      const published = latest.publicIncidentUpdateDate ?? latest.created_at
      if (published) {
        lines.push(`${chalk.dim('Published:')} ${formatDate(published, format)}`)
      }
    }
  }

  return lines.join('\n')
}

interface IncidentUpdateView {
  incidentId: string
  update: IncidentUpdate
}

const incidentUpdateDetailFields: DetailField<IncidentUpdateView>[] = [
  { label: 'Incident ID', value: v => v.incidentId },
  {
    label: 'Status',
    value: (v, fmt) => formatIncidentStatus(v.update.status, fmt),
  },
  { label: 'Message', value: v => v.update.description },
  {
    label: 'Published',
    value: (v, fmt) => formatDate(v.update.publicIncidentUpdateDate ?? v.update.created_at, fmt),
  },
  { label: 'Update ID', value: v => v.update.id ?? null },
]

export function formatIncidentUpdateDetail (
  incidentId: string,
  update: IncidentUpdate,
  format: OutputFormat,
  title = 'Incident Update',
): string {
  return renderDetailFields(title, incidentUpdateDetailFields, { incidentId, update }, format)
}
