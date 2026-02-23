import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import * as api from '../../rest/api'
import type { Check } from '../../rest/checks'
import type { CheckStatus } from '../../rest/check-statuses'
import type { CheckGroup } from '../../rest/check-groups'
import type { CheckWithStatus } from '../../formatters/checks'
import type { OutputFormat } from '../../formatters/render'
import {
  formatChecks,
  formatSummaryBar,
  formatPaginationInfo,
  formatNavigationHints,
} from '../../formatters/checks'

/**
 * Match webapp logic: a check is effectively active only if both the check
 * AND its parent group (if any) are activated.
 */
/**
 * Match webapp: heartbeats are excluded from the home dashboard summary
 * (they have their own page), and checks in deactivated groups are treated
 * as inactive.
 */
export function buildActiveCheckIds (checks: Check[], groups: CheckGroup[]): Set<string> {
  const deactivatedGroups = new Set(groups.filter(g => !g.activated).map(g => g.id))
  return new Set(
    checks
      .filter(c =>
        c.activated
        && c.checkType !== 'HEARTBEAT'
        && !(c.groupId && deactivatedGroups.has(c.groupId)),
      )
      .map(c => c.id),
  )
}

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
    'status': Flags.string({
      description: 'Filter by status.',
      options: ['passing', 'degraded', 'failing'],
    }),
    'type': Flags.string({
      description: 'Filter by check type.',
      options: ['API', 'BROWSER', 'MULTI_STEP', 'HEARTBEAT', 'PLAYWRIGHT', 'TCP'],
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

    // Client-side filters require fetching all checks (same approach as the webapp)
    const needsAllChecks = !!(flags.search || flags.status || flags.type)

    let filteredChecks: CheckWithStatus[]
    let totalChecks: number
    let statuses: CheckStatus[]
    let activeCheckIds: Set<string> | undefined

    try {
      if (needsAllChecks) {
        const [checkList, allStatuses, groupsResp] = await Promise.all([
          api.checks.fetchAll({ tag: flags.tag }),
          api.checkStatuses.fetchAll(),
          api.checkGroups.getAll(),
        ])
        statuses = allStatuses
        totalChecks = checkList.length
        activeCheckIds = buildActiveCheckIds(checkList, groupsResp.data)

        const statusMap = new Map(statuses.map(s => [s.checkId, s]))
        let merged: CheckWithStatus[] = checkList.map(c => ({ ...c, status: statusMap.get(c.id) }))

        if (flags.search) {
          const term = flags.search.toLowerCase()
          merged = merged.filter(c => c.name.toLowerCase().includes(term))
        }
        if (flags.status) {
          merged = merged.filter(c => {
            if (!c.status) return false
            if (flags.status === 'failing') return c.status.hasFailures || c.status.hasErrors
            if (flags.status === 'degraded') return c.status.isDegraded
            if (flags.status === 'passing') return !c.status.hasFailures && !c.status.hasErrors && !c.status.isDegraded
            return true
          })
        }
        if (flags.type) {
          merged = merged.filter(c => c.checkType === flags.type)
        }

        filteredChecks = merged
      } else {
        const [paginated, allStatuses] = await Promise.all([
          api.checks.getAllPaginated({ limit, page, tag: flags.tag }),
          api.checkStatuses.fetchAll(),
        ])
        statuses = allStatuses
        totalChecks = paginated.total
        // On the paginated path, skip the extra fetchAll + groups call.
        // The summary bar will count all statuses (including heartbeats).
        activeCheckIds = undefined

        const statusMap = new Map(statuses.map(s => [s.checkId, s]))
        filteredChecks = paginated.checks.map(c => ({ ...c, status: statusMap.get(c.id) }))
      }

      // Build active filters for display
      const activeFilters: string[] = []
      if (flags.tag) activeFilters.push(...flags.tag.map(t => `tag=${t}`))
      if (flags.search) activeFilters.push(`search="${flags.search}"`)
      if (flags.status) activeFilters.push(`status=${flags.status}`)
      if (flags.type) activeFilters.push(`type=${flags.type}`)

      // When filtering all checks, paginate the filtered results client-side
      const filteredTotal = needsAllChecks ? filteredChecks.length : totalChecks
      const displayChecks = needsAllChecks
        ? filteredChecks.slice((page - 1) * limit, page * limit)
        : filteredChecks

      const pagination = { page, limit, total: filteredTotal }

      // JSON output
      if (flags.output === 'json') {
        const totalPages = Math.ceil(filteredTotal / limit)
        this.log(JSON.stringify({
          data: displayChecks,
          pagination: { page, limit, total: filteredTotal, totalPages },
        }, null, 2))
        return
      }

      if (filteredTotal === 0 && activeFilters.length === 0) {
        this.log('No checks found.')
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      // Markdown output
      if (fmt === 'md') {
        this.log(formatChecks(displayChecks, fmt, { pagination }))
        return
      }

      // Table output
      const output: string[] = []

      output.push(formatSummaryBar(statuses, totalChecks, activeCheckIds))
      output.push('')

      if (displayChecks.length === 0) {
        const filterDesc = activeFilters.join(', ')
        output.push(chalk.dim(`No checks matching: ${filterDesc}`))
        output.push('')
        output.push(chalk.dim('Try:'))
        output.push(`  checkly checks list ${chalk.dim('(show all)')}`)
        if (flags.status) {
          const otherStatuses = ['passing', 'degraded', 'failing'].filter(s => s !== flags.status)
          output.push(`  checkly checks list --status ${otherStatuses[0]} ${chalk.dim(`(try ${otherStatuses[0]})`)}`)
        }
      } else {
        output.push(formatChecks(displayChecks, fmt, { showId: !flags['hide-id'] }))
        output.push('')
        output.push(formatPaginationInfo(pagination))
        output.push('')
        output.push(formatNavigationHints(pagination, activeFilters))
      }

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to list checks.', err)
      this.exit(1)
    }
  }
}
