import chalk from 'chalk'
import type { StatusPage } from '../rest/status-pages'
import {
  type OutputFormat,
  type ColumnDef,
  truncateToWidth,
  renderTable,
} from './render'

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

  const termWidth = process.stdout.columns || 120
  const nameWidth = Math.min(24, Math.floor(termWidth * 0.18))
  const urlWidth = Math.min(26, Math.floor(termWidth * 0.20))
  const cardWidth = Math.min(20, Math.floor(termWidth * 0.16))
  const serviceWidth = Math.min(24, Math.floor(termWidth * 0.20))

  return [
    {
      header: 'Name',
      width: nameWidth,
      value: r => truncateToWidth(r.name, nameWidth - 2),
    },
    {
      header: 'URL',
      width: urlWidth,
      value: r => {
        const display = r.customDomain ?? r.url
        return truncateToWidth(display, urlWidth - 2)
      },
    },
    {
      header: 'Card',
      width: cardWidth,
      value: r => truncateToWidth(r.card, cardWidth - 2),
    },
    {
      header: 'Service',
      width: serviceWidth,
      value: r => truncateToWidth(r.service, serviceWidth - 2),
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
  return renderTable(columns, rows, format)
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

  const termWidth = process.stdout.columns || 120
  const nameWidth = Math.min(30, Math.floor(termWidth * 0.25))
  const urlWidth = Math.min(32, Math.floor(termWidth * 0.28))

  return [
    {
      header: 'Name',
      width: nameWidth,
      value: sp => truncateToWidth(sp.name, nameWidth - 2),
    },
    {
      header: 'URL',
      width: urlWidth,
      value: sp => {
        const display = sp.customDomain ?? sp.url
        return truncateToWidth(display, urlWidth - 2)
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
  return renderTable(columns, statusPages, format)
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
