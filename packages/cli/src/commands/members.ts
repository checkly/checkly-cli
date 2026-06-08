import { Flags } from '@oclif/core'
import { AuthCommand } from './authCommand.js'
import { outputFlag } from '../helpers/flags.js'
import * as api from '../rest/api.js'
import type { OutputFormat } from '../formatters/render.js'
import type {
  AccountMemberRole,
  AccountMemberStatus,
  AccountMemberType,
  AccountMembersListParams,
} from '../rest/account-members.js'
import {
  formatAccountMembers,
  formatCursorNavigationHints,
  formatCursorPaginationInfo,
} from '../formatters/account-members.js'

const accountMemberTypes = ['member', 'invite'] as const
const accountMemberRoles = ['OWNER', 'ADMIN', 'READ_WRITE', 'READ_RUN', 'READ_ONLY'] as const
const accountMemberStatuses = ['ACTIVE', 'PENDING', 'EXPIRED'] as const
const accountMemberRoleOptions = accountMemberRoles.map(role => role.toLowerCase())
const accountMemberStatusOptions = accountMemberStatuses.map(status => status.toLowerCase())

function isAccountMemberType (value: string): value is AccountMemberType {
  return accountMemberTypes.includes(value as AccountMemberType)
}

function isAccountMemberRole (value: string): value is AccountMemberRole {
  return accountMemberRoles.includes(value as AccountMemberRole)
}

function isAccountMemberStatus (value: string): value is AccountMemberStatus {
  return accountMemberStatuses.includes(value as AccountMemberStatus)
}

export function normalizeAccountMemberType (value: string | undefined): AccountMemberType | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  return isAccountMemberType(normalized) ? normalized : undefined
}

export function normalizeAccountMemberRole (value: string | undefined): AccountMemberRole | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().toUpperCase()
  return isAccountMemberRole(normalized) ? normalized : undefined
}

export function normalizeAccountMemberStatus (value: string | undefined): AccountMemberStatus | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().toUpperCase()
  return isAccountMemberStatus(normalized) ? normalized : undefined
}

export default class AccountMembers extends AuthCommand {
  static hidden = false
  static hiddenAliases = ['account members']
  static readOnly = true
  static idempotent = true
  static description = 'List account members and pending invites.'

  static flags = {
    'search': Flags.string({
      char: 's',
      description: 'Search members and invites by name or email.',
    }),
    'type': Flags.string({
      description: 'Filter by item type: member or invite.',
    }),
    'role': Flags.string({
      description: `Filter by member or invite role: ${accountMemberRoleOptions.join(', ')}.`,
    }),
    'status': Flags.string({
      description: `Filter by member or invite status: ${accountMemberStatusOptions.join(', ')}.`,
    }),
    'limit': Flags.integer({
      char: 'l',
      description: 'Number of account members to return (1-100). Enables cursor pagination.',
    }),
    'next-id': Flags.string({
      description: 'Cursor for next page. Requires --limit.',
    }),
    'hide-id': Flags.boolean({
      description: 'Hide member and invite IDs in table output.',
      default: false,
    }),
    'output': outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(AccountMembers)
    this.style.outputFormat = flags.output
    const limit = flags.limit

    if (limit !== undefined && (limit < 1 || limit > 100)) {
      this.error('--limit must be an integer between 1 and 100.')
    }

    if (flags['next-id'] && limit === undefined) {
      this.error('Cannot use --next-id without --limit.')
    }

    const type = normalizeAccountMemberType(flags.type)
    if (flags.type && !type) {
      this.error(`Invalid --type "${flags.type}". Valid values: ${accountMemberTypes.join(', ')}.`)
    }

    const role = normalizeAccountMemberRole(flags.role)
    if (flags.role && !role) {
      this.error(`Invalid --role "${flags.role}". Valid values: ${accountMemberRoleOptions.join(', ')}.`)
    }

    const status = normalizeAccountMemberStatus(flags.status)
    if (flags.status && !status) {
      this.error(`Invalid --status "${flags.status}". Valid values: ${accountMemberStatusOptions.join(', ')}.`)
    }

    const params: AccountMembersListParams = {
      search: flags.search,
      type,
      role,
      status,
      limit,
      nextId: flags['next-id'],
    }

    try {
      const { data } = await api.accountMembers.getAll(params)

      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
        return
      }

      if (data.members.length === 0) {
        this.log('No account members found.')
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      if (fmt === 'md') {
        this.log(formatAccountMembers(data.members, fmt, { showId: !flags['hide-id'] }))
        return
      }

      const output = [
        formatAccountMembers(data.members, fmt, { showId: !flags['hide-id'] }),
      ]

      if (limit !== undefined) {
        output.push('')
        output.push(formatCursorPaginationInfo(data.length, data.nextId))

        const navHints = formatCursorNavigationHints(data.nextId)
        if (navHints) {
          output.push('')
          output.push(navHints.replace('<limit>', String(limit)))
        }
      }

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to list account members.', err)
      process.exitCode = 1
    }
  }
}
