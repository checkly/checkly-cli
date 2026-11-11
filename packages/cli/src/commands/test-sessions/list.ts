import { Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import type { ListTestSessionsParams, TestSessionProvider, TestSessionStatus } from '../../rest/test-sessions.js'
import type { OutputFormat } from '../../formatters/render.js'
import {
  formatTestSessionsList,
  formatTestSessionsListNavigationHints,
  formatTestSessionsListPaginationInfo,
} from '../../formatters/test-sessions.js'

const statusOptions = ['running', 'failed', 'passed', 'cancelled'] as const
const providerOptions = ['github', 'vercel', 'api', 'trigger', 'pw_reporter'] as const

function quoteArg (value: string): string {
  if (/^[A-Za-z0-9._/@:+=,-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function parseUnixTimestamp (value: string | undefined, label: string): number | undefined {
  if (!value) return undefined

  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed)
  }

  const timestamp = Date.parse(trimmed)
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid --${label} "${value}". Use an ISO date or Unix timestamp in seconds.`)
  }

  return Math.floor(timestamp / 1000)
}

function normalizeStatus (value: string): TestSessionStatus | undefined {
  const normalized = value.trim().toUpperCase()
  return ['RUNNING', 'FAILED', 'PASSED', 'CANCELLED'].includes(normalized)
    ? normalized as TestSessionStatus
    : undefined
}

function normalizeProvider (value: string): TestSessionProvider | undefined {
  const normalized = value.trim().replace(/-/g, '_').toUpperCase()
  return ['GITHUB', 'VERCEL', 'API', 'TRIGGER', 'PW_REPORTER'].includes(normalized)
    ? normalized as TestSessionProvider
    : undefined
}

function buildListCommand (flags: Record<string, any>): string {
  const parts = ['checkly test-sessions list', '--limit', String(flags.limit)]

  const appendMany = (flag: string, values: string[] | undefined) => {
    for (const value of values ?? []) {
      parts.push(flag, quoteArg(value))
    }
  }

  if (flags.from) parts.push('--from', quoteArg(flags.from))
  if (flags.to) parts.push('--to', quoteArg(flags.to))
  appendMany('--status', flags.status)
  appendMany('--branch', flags.branch)
  appendMany('--user', flags.user)
  appendMany('--provider', flags.provider)
  if (flags['no-users']) parts.push('--no-users')
  if (flags.search) parts.push('--search', quoteArg(flags.search))
  if (flags['error-group']) parts.push('--error-group', quoteArg(flags['error-group']))

  return parts.join(' ')
}

export default class TestSessionsList extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'List recorded test sessions.'

  static flags = {
    'limit': Flags.integer({
      char: 'l',
      description: 'Number of test sessions to return (1-100).',
      default: 20,
    }),
    'cursor': Flags.string({
      description: 'Cursor for next page (from previous output).',
    }),
    'from': Flags.string({
      description: 'Only include test sessions created at or after this ISO date or Unix timestamp.',
    }),
    'to': Flags.string({
      description: 'Only include test sessions created before this ISO date or Unix timestamp.',
    }),
    'status': Flags.string({
      description: `Filter by test session status: ${statusOptions.join(', ')}. Can be specified multiple times.`,
      multiple: true,
      delimiter: ',',
    }),
    'branch': Flags.string({
      description: 'Filter by Git branch name. Can be specified multiple times.',
      multiple: true,
      delimiter: ',',
    }),
    'user': Flags.string({
      description: 'Filter by commit owner or invoking user ID. Can be specified multiple times.',
      multiple: true,
      delimiter: ',',
    }),
    'no-users': Flags.boolean({
      description: 'Include sessions with no commit owner and no invoking user.',
      default: false,
    }),
    'provider': Flags.string({
      description: `Filter by test session provider: ${providerOptions.join(', ')}. Can be specified multiple times.`,
      multiple: true,
      delimiter: ',',
    }),
    'search': Flags.string({
      char: 's',
      description: 'Search test session text fields (3-200 characters).',
    }),
    'error-group': Flags.string({
      description: 'Filter by test-session error group ID.',
    }),
    'output': outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(TestSessionsList)
    this.style.outputFormat = flags.output

    if (flags.limit < 1 || flags.limit > 100) {
      this.error('--limit must be an integer between 1 and 100.')
    }

    if (flags.search && (flags.search.length < 3 || flags.search.length > 200)) {
      this.error('--search must be between 3 and 200 characters.')
    }

    const statuses = flags.status?.map(normalizeStatus)
    if (flags.status && statuses?.some(status => !status)) {
      this.error(`Invalid --status value. Valid values: ${statusOptions.join(', ')}.`)
    }

    const providers = flags.provider?.map(normalizeProvider)
    if (flags.provider && providers?.some(provider => !provider)) {
      this.error(`Invalid --provider value. Valid values: ${providerOptions.join(', ')}.`)
    }

    let from: number | undefined
    let to: number | undefined

    try {
      from = parseUnixTimestamp(flags.from, 'from')
      to = parseUnixTimestamp(flags.to, 'to')
    } catch (err: any) {
      this.error(err.message)
    }

    const params: ListTestSessionsParams = {
      from,
      to,
      limit: flags.limit,
      statuses: statuses?.filter(Boolean) as TestSessionStatus[] | undefined,
      branches: flags.branch,
      users: flags.user,
      providers: providers?.filter(Boolean) as TestSessionProvider[] | undefined,
      noUsers: flags['no-users'] || undefined,
      nextId: flags.cursor,
      textSearch: flags.search,
      errorGroupId: flags['error-group'],
    }

    try {
      const { data } = await api.testSessions.list(params)

      if (flags.output === 'json') {
        this.log(JSON.stringify({
          data: data.entries,
          pagination: {
            nextId: data.nextId,
            length: data.length,
          },
        }, null, 2))
        return
      }

      if (data.length === 0) {
        this.log('No test sessions found.')
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      const lines = [
        formatTestSessionsList(data.entries, fmt),
      ]

      if (fmt === 'terminal') {
        lines.push('')
        lines.push(formatTestSessionsListPaginationInfo(data.length, data.nextId))

        const navHints = formatTestSessionsListNavigationHints(
          data.nextId,
          buildListCommand(flags),
          data.entries[0]?.id,
        )
        if (navHints) {
          lines.push('')
          lines.push(navHints)
        }
      }

      this.log(lines.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to list test sessions.', err)
      process.exitCode = 1
    }
  }
}
