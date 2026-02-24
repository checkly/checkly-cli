import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import * as api from '../../rest/api'
import type { CheckWithStatus } from '../../formatters/checks'
import type { OutputFormat } from '../../formatters/render'
import {
  formatChecks,
  formatSummaryBar,
  formatPaginationInfo,
  formatNavigationHints,
} from '../../formatters/checks'

export default class ChecksList extends AuthCommand {
  static hidden = false
  static description = 'List all checks in your account.'

  static flags = {
    'limit': Flags.integer({
      char: 'l',
      description: 'Number of checks to return (1-100).',
      default: 25,
    }),
    'page': Flags.integer({
      char: 'p',
      description: 'Page number.',
      default: 1,
    }),
    'tag': Flags.string({
      char: 't',
      description: 'Filter by tag. Can be specified multiple times.',
      multiple: true,
    }),
    'search': Flags.string({
      char: 's',
      description: 'Filter checks by name (case-insensitive).',
    }),
    'type': Flags.string({
      description: 'Filter by check type.',
      options: ['API', 'BROWSER', 'MULTI_STEP', 'HEARTBEAT', 'PLAYWRIGHT', 'TCP', 'DNS', 'ICMP', 'URL'],
    }),
    'hide-id': Flags.boolean({
      description: 'Hide check IDs in table output.',
      default: false,
    }),
    'output': Flags.string({
      char: 'o',
      description: 'Output format.',
      options: ['table', 'json', 'md'],
      default: 'table',
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ChecksList)
    this.style.outputFormat = flags.output
    const { page, limit } = flags

    try {
      // All filtering is server-side — single paginated API call
      const [paginated, statuses] = await Promise.all([
        api.checks.getAllPaginated({
          limit,
          page,
          tag: flags.tag,
          checkType: flags.type,
          search: flags.search,
        }),
        api.checkStatuses.fetchAll().catch(() => []),
      ])

      const statusMap = new Map(statuses.map(s => [s.checkId, s]))
      const checks: CheckWithStatus[] = paginated.checks.map(c => ({ ...c, status: statusMap.get(c.id) }))
      const totalChecks = paginated.total
      const pagination = { page, limit, total: totalChecks }

      // Build active filters for display
      const activeFilters: string[] = []
      if (flags.tag) activeFilters.push(...flags.tag.map(t => `tag=${t}`))
      if (flags.search) activeFilters.push(`search="${flags.search}"`)
      if (flags.type) activeFilters.push(`type=${flags.type}`)

      // JSON output
      if (flags.output === 'json') {
        const totalPages = Math.ceil(totalChecks / limit)
        this.log(JSON.stringify({
          data: checks,
          pagination: { page, limit, total: totalChecks, totalPages },
        }, null, 2))
        return
      }

      if (totalChecks === 0 && activeFilters.length === 0) {
        this.log('No checks found.')
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      // Markdown output
      if (fmt === 'md') {
        this.log(formatChecks(checks, fmt, { pagination }))
        return
      }

      // Table output
      const output: string[] = []

      output.push(formatSummaryBar(statuses, totalChecks))
      output.push('')

      if (checks.length === 0) {
        const filterDesc = activeFilters.join(', ')
        output.push(chalk.dim(`No checks matching: ${filterDesc}`))
        output.push('')
        output.push(chalk.dim('Try:'))
        output.push(`  checkly checks list ${chalk.dim('(show all)')}`)
      } else {
        output.push(formatChecks(checks, fmt, { showId: !flags['hide-id'] }))
        output.push('')
        output.push(formatPaginationInfo(pagination))
        output.push('')
        output.push(formatNavigationHints(pagination, activeFilters))
      }

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to list checks.', err)
      process.exitCode = 1
    }
  }
}
