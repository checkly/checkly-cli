import chalk from 'chalk'
import type { StatusPage } from '../rest/status-pages.js'
import {
  type OutputFormat,
  type ColumnDef,
  type DetailField,
  renderAdaptiveTable,
  renderDetailFields,
} from './render.js'

// --- Expanded row type: one row per service, all fields repeated ---

interface ExpandedRow {
  name: string
  url: string
  customDomain: string | null
  isPrivate: boolean
  card: string
  service: string
  id: string
}

function expandStatusPages (statusPages: StatusPage[]): ExpandedRow[] {
  const rows: ExpandedRow[] = []
  for (const sp of statusPages) {
    if (sp.cards.length === 0) {
      rows.push({
        name: sp.name,
        url: sp.url,
        customDomain: sp.customDomain,
        isPrivate: sp.isPrivate,
        card: '-',
        service: '-',
        id: sp.id,
      })
      continue
    }
    for (const card of sp.cards) {
      if (card.services.length === 0) {
        rows.push({
          name: sp.name,
          url: sp.url,
          customDomain: sp.customDomain,
          isPrivate: sp.isPrivate,
          card: card.name,
          service: '-',
          id: sp.id,
        })
        continue
      }
      for (const svc of card.services) {
        rows.push({
          name: sp.name,
          url: sp.url,
          customDomain: sp.customDomain,
          isPrivate: sp.isPrivate,
          card: card.name,
          service: svc.name,
          id: sp.id,
        })
      }
    }
  }
  return rows
}

// --- Expanded table columns (default: one row per service) ---

function buildExpandedColumns (format: OutputFormat): ColumnDef<ExpandedRow>[] {
  if (format === 'md') {
    return [
      { header: 'Name', value: r => r.name },
      { header: 'URL', value: r => r.customDomain ?? r.url },
      { header: 'Card', value: r => r.card },
      { header: 'Service', value: r => r.service },
      { header: 'ID', value: r => r.id },
    ]
  }

  return [
    {
      header: 'Name',
      minWidth: 10,
      maxWidth: 24,
      value: r => r.name,
    },
    {
      header: 'URL',
      minWidth: 12,
      maxWidth: 32,
      value: r => {
        return r.customDomain ?? r.url
      },
    },
    {
      header: 'Card',
      minWidth: 8,
      maxWidth: 22,
      value: r => r.card,
    },
    {
      header: 'Service',
      minWidth: 8,
      maxWidth: 24,
      value: r => r.service,
    },
    {
      header: 'ID',
      value: r => chalk.dim(r.id),
    },
  ]
}

export function formatStatusPagesExpanded (statusPages: StatusPage[], format: OutputFormat): string {
  const rows = expandStatusPages(statusPages)
  const columns = buildExpandedColumns(format)
  return renderAdaptiveTable(columns, rows, format)
}

// --- Compact table columns (one row per status page) ---

function buildCompactColumns (format: OutputFormat): ColumnDef<StatusPage>[] {
  if (format === 'md') {
    return [
      { header: 'Name', value: sp => sp.name },
      { header: 'URL', value: sp => sp.customDomain ?? sp.url },
      { header: 'Private', value: sp => sp.isPrivate ? 'yes' : '-' },
      { header: 'Cards', value: sp => String(sp.cards.length) },
      { header: 'ID', value: sp => sp.id },
    ]
  }

  return [
    {
      header: 'Name',
      minWidth: 12,
      maxWidth: 30,
      value: sp => sp.name,
    },
    {
      header: 'URL',
      minWidth: 14,
      maxWidth: 36,
      value: sp => {
        return sp.customDomain ?? sp.url
      },
    },
    {
      header: 'Private',
      width: 9,
      value: sp => sp.isPrivate ? chalk.yellow('yes') : chalk.dim('-'),
    },
    {
      header: 'Cards',
      width: 7,
      value: sp => String(sp.cards.length),
    },
    {
      header: 'ID',
      value: sp => chalk.dim(sp.id),
    },
  ]
}

export function formatStatusPagesCompact (statusPages: StatusPage[], format: OutputFormat): string {
  const columns = buildCompactColumns(format)
  return renderAdaptiveTable(columns, statusPages, format)
}

// --- Cursor pagination helpers ---

export function formatCursorPaginationInfo (count: number, nextId: string | null): string {
  const base = `${count} status page${count !== 1 ? 's' : ''}`
  if (nextId) {
    return chalk.dim(`Showing ${base} (more available)`)
  }
  return chalk.dim(`${base}`)
}

export function formatCursorNavigationHints (nextId: string | null): string {
  const lines: string[] = []
  if (nextId) {
    lines.push(`  ${chalk.dim('Next page:')}    checkly status-pages list --cursor ${nextId}`)
  }
  return lines.join('\n')
}

// --- Detail view for a single status page ---

interface ServiceRow {
  card: string
  service: string
  serviceId: string
}

function flattenServices (sp: StatusPage): ServiceRow[] {
  const rows: ServiceRow[] = []
  for (const card of sp.cards) {
    for (const svc of card.services) {
      rows.push({ card: card.name, service: svc.name, serviceId: svc.id })
    }
  }
  return rows
}

const statusPageDetailFields: DetailField<StatusPage>[] = [
  {
    label: 'URL',
    value: sp => sp.customDomain ?? sp.url,
  },
  {
    label: 'Private',
    value: (sp, fmt) => {
      if (fmt === 'md') return sp.isPrivate ? 'yes' : 'no'
      return sp.isPrivate ? chalk.yellow('yes') : 'no'
    },
  },
  {
    label: 'Theme',
    value: sp => sp.defaultTheme,
  },
  {
    label: 'Cards',
    value: sp => String(sp.cards.length),
  },
  {
    label: 'ID',
    value: sp => sp.id,
  },
]

function buildServiceColumns (format: OutputFormat): ColumnDef<ServiceRow>[] {
  if (format === 'md') {
    return [
      { header: 'Card', value: r => r.card },
      { header: 'Service', value: r => r.service },
      { header: 'Service ID', value: r => r.serviceId },
    ]
  }

  return [
    { header: 'Card', minWidth: 8, maxWidth: 24, value: r => r.card },
    { header: 'Service', minWidth: 8, maxWidth: 28, value: r => r.service },
    { header: 'Service ID', value: r => chalk.dim(r.serviceId) },
  ]
}

export function formatStatusPageDetail (sp: StatusPage, format: OutputFormat): string {
  const lines: string[] = []

  lines.push(renderDetailFields(sp.name, statusPageDetailFields, sp, format))

  const serviceRows = flattenServices(sp)

  if (serviceRows.length === 0) {
    if (format === 'md') {
      lines.push('')
      lines.push('## Services')
      lines.push('')
      lines.push('No services configured.')
    } else {
      lines.push('')
      lines.push(chalk.dim('No services configured.'))
    }
  } else {
    const columns = buildServiceColumns(format)
    if (format === 'md') {
      lines.push('')
      lines.push('## Services')
      lines.push('')
    } else {
      lines.push('')
      lines.push(chalk.bold('SERVICES'))
    }
    lines.push(renderAdaptiveTable(columns, serviceRows, format))
  }

  return lines.join('\n')
}
