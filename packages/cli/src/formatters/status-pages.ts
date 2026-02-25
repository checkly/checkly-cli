import chalk from 'chalk'
import type { StatusPage } from '../rest/status-pages'
import {
  type OutputFormat,
  type ColumnDef,
  truncateToWidth,
  renderTable,
} from './render'

// --- Table columns ---

function buildColumns (format: OutputFormat): ColumnDef<StatusPage>[] {
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

export function formatStatusPages (statusPages: StatusPage[], format: OutputFormat): string {
  const columns = buildColumns(format)
  return renderTable(columns, statusPages, format)
}

// --- Card/service tree (terminal only) ---

export function formatStatusPageTree (statusPage: StatusPage): string {
  if (statusPage.cards.length === 0) return ''

  const lines: string[] = []
  for (const card of statusPage.cards) {
    lines.push(`  ${chalk.bold(card.name)}`)
    for (let i = 0; i < card.services.length; i++) {
      const isLast = i === card.services.length - 1
      const prefix = isLast ? '└──' : '├──'
      lines.push(`    ${chalk.dim(prefix)} ${card.services[i].name}`)
    }
  }
  return lines.join('\n')
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
