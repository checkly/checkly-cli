import chalk from 'chalk'
import type { AccountMember } from '../rest/account-members'
import {
  type ColumnDef,
  type OutputFormat,
  formatDate,
  renderTable,
  truncateToWidth,
} from './render'

export interface AccountMembersTableOptions {
  showId?: boolean
}

export function formatCursorPaginationInfo (count: number, nextId: string | null): string {
  const base = `${count} account member${count !== 1 ? 's' : ''}`
  if (nextId) {
    return chalk.dim(`Showing ${base} (more available)`)
  }
  return chalk.dim(`Showing ${base}`)
}

export function formatCursorNavigationHints (nextId: string | null): string {
  if (!nextId) return ''
  return `  ${chalk.dim('Next page:')}    checkly account members --limit <limit> --next-id ${nextId}`
}

function boolSymbol (value: boolean | undefined, format: OutputFormat): string {
  if (value === undefined) return format === 'terminal' ? chalk.dim('-') : '-'
  if (format === 'md') return value ? 'yes' : '-'
  return value ? chalk.green('yes') : chalk.dim('-')
}

function memberName (member: AccountMember, format: OutputFormat): string {
  if (member.type === 'invite') return format === 'terminal' ? chalk.dim('-') : '-'
  return member.name ?? (format === 'terminal' ? chalk.dim('-') : '-')
}

function memberId (member: AccountMember): string {
  return member.type === 'member' ? member.userId : member.id
}

function expiresAt (member: AccountMember, format: OutputFormat): string {
  if (member.type === 'member') return format === 'terminal' ? chalk.dim('-') : '-'
  return formatDate(member.expiresAt, format)
}

function buildAccountMemberColumns (
  members: AccountMember[],
  format: OutputFormat,
  options: AccountMembersTableOptions = {},
): ColumnDef<AccountMember>[] {
  if (format === 'md') {
    const columns: ColumnDef<AccountMember>[] = [
      { header: 'Type', value: m => m.type },
      { header: 'Email', value: m => m.email },
      { header: 'Name', value: (m, fmt) => memberName(m, fmt) },
      { header: 'Role', value: m => m.role },
      { header: 'Status', value: m => m.status },
      { header: 'MFA', value: (m, fmt) => boolSymbol(m.type === 'member' ? m.mfaEnabled : undefined, fmt) },
      { header: 'SSO', value: (m, fmt) => boolSymbol(m.type === 'member' ? m.ssoEnabled : undefined, fmt) },
      { header: 'Support', value: (m, fmt) => boolSymbol(m.type === 'member' ? m.isSupportMembership : undefined, fmt) },
      { header: 'Expires', value: (m, fmt) => expiresAt(m, fmt) },
    ]

    if (options.showId !== false) {
      columns.push({ header: 'ID', value: memberId })
    }

    return columns
  }

  const showId = options.showId !== false
  const termWidth = process.stdout.columns || 120
  const idReserve = showId ? 38 : 0
  const fixedWidth = 8 + 13 + 10 + 5 + 5 + 9 + 25 + idReserve
  const flexibleWidth = Math.max(24, termWidth - fixedWidth)
  const hasNames = members.some(member => member.type === 'member' && member.name)
  const emailWidth = Math.max(20, Math.min(34, Math.floor(flexibleWidth * (hasNames ? 0.6 : 1))))
  const nameWidth = hasNames ? Math.max(14, Math.min(24, flexibleWidth - emailWidth)) : 0

  const columns: ColumnDef<AccountMember>[] = [
    {
      header: 'Type',
      width: 8,
      value: m => m.type,
    },
    {
      header: 'Email',
      width: emailWidth,
      value: m => truncateToWidth(m.email, emailWidth - 2),
    },
  ]

  if (hasNames) {
    columns.push({
      header: 'Name',
      width: nameWidth,
      value: (m, fmt) => truncateToWidth(memberName(m, fmt), nameWidth - 2),
    })
  }

  columns.push(
    {
      header: 'Role',
      width: 13,
      value: m => m.role,
    },
    {
      header: 'Status',
      width: 10,
      value: m => m.status,
    },
    {
      header: 'MFA',
      width: 5,
      value: (m, fmt) => boolSymbol(m.type === 'member' ? m.mfaEnabled : undefined, fmt),
    },
    {
      header: 'SSO',
      width: 5,
      value: (m, fmt) => boolSymbol(m.type === 'member' ? m.ssoEnabled : undefined, fmt),
    },
    {
      header: 'Support',
      width: 9,
      value: (m, fmt) => boolSymbol(m.type === 'member' ? m.isSupportMembership : undefined, fmt),
    },
    {
      header: 'Expires',
      width: 25,
      value: (m, fmt) => truncateToWidth(expiresAt(m, fmt), 23),
    },
  )

  if (showId) {
    columns.push({
      header: 'ID',
      value: m => chalk.dim(memberId(m)),
    })
  }

  return columns
}

export function formatAccountMembers (
  members: AccountMember[],
  format: OutputFormat,
  options: AccountMembersTableOptions = {},
): string {
  return renderTable(buildAccountMemberColumns(members, format, options), members, format)
}
