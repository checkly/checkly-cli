import { Args, Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import { batchQuickRangeValues, type BatchQuickRange } from '../../rest/batch-analytics'
import type { Check } from '../../rest/checks'
import type { CheckStatus } from '../../rest/check-statuses'
import type { CheckWithStatus, PaginationInfo } from '../../formatters/checks'
import { formatSummaryBar, formatPaginationInfo } from '../../formatters/checks'
import type { OutputFormat } from '../../formatters/render'
import type { StatsRow } from '../../formatters/batch-stats'
import { formatBatchStats, formatBatchStatsNavigationHints } from '../../formatters/batch-stats'
import { allCheckTypes } from '../../constants'

const MAX_BATCH_SIZE = 100

export default class ChecksStats extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Show analytics stats for your checks.'

  static args = {
    checkIds: Args.string({
      description: 'One or more check IDs to get stats for.',
      required: false,
    }),
  }

  static strict = false

  static flags = {
    range: Flags.string({
      char: 'r',
      description: 'Time range for stats.',
      options: batchQuickRangeValues,
      default: 'last24Hours',
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'Number of checks to return (1-100).',
      default: 25,
    }),
    page: Flags.integer({
      char: 'p',
      description: 'Page number.',
      default: 1,
    }),
    tag: Flags.string({
      char: 't',
      description: 'Filter by tag. Can be specified multiple times.',
      multiple: true,
    }),
    search: Flags.string({
      char: 's',
      description: 'Filter checks by name (case-insensitive).',
    }),
    type: Flags.string({
      description: 'Filter by check type.',
      options: allCheckTypes,
    }),
    output: outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags, argv } = await this.parse(ChecksStats)
    this.style.outputFormat = flags.output
    const range = flags.range as BatchQuickRange
    const { page, limit } = flags

    try {
      // Collect explicit check IDs from positional args
      const explicitIds = (argv as string[]).filter(a => !a.startsWith('-'))

      let checksWithStatus: CheckWithStatus[]
      let totalChecks: number
      let allChecks: Check[]
      let allStatuses: CheckStatus[]

      if (explicitIds.length > 0) {
        // Fetch all checks (paginate through all pages), filter to requested IDs
        ;[allChecks, allStatuses] = await Promise.all([
          api.checks.fetchAll(),
          api.checkStatuses.fetchAll().catch(() => []),
        ])
        const statusMap = new Map(allStatuses.map(s => [s.checkId, s]))
        const idSet = new Set(explicitIds)
        checksWithStatus = allChecks
          .filter(c => idSet.has(c.id))
          .map(c => ({ ...c, status: statusMap.get(c.id) }))
        totalChecks = checksWithStatus.length
      } else {
        // Paginated fetch with filters for the table; account-wide fetch drives
        // the summary bar, which doesn't react to filters.
        const paginatedResult = await Promise.all([
          api.checks.getAllPaginated({
            limit,
            page,
            tag: flags.tag,
            checkType: flags.type,
            search: flags.search,
          }),
          api.checks.fetchAll(),
          api.checkStatuses.fetchAll().catch(() => []),
        ])
        const paginated = paginatedResult[0]
        allChecks = paginatedResult[1]
        allStatuses = paginatedResult[2]
        const statusMap = new Map(allStatuses.map(s => [s.checkId, s]))
        checksWithStatus = paginated.checks.map(c => ({ ...c, status: statusMap.get(c.id) }))
        totalChecks = paginated.total
      }

      if (checksWithStatus.length === 0) {
        if (flags.output === 'json') {
          const totalPages = 0
          this.log(JSON.stringify({
            data: [],
            pagination: { page, limit, total: 0, totalPages },
            range,
          }, null, 2))
        } else {
          this.log('No checks found.')
        }
        return
      }

      // Fetch batch analytics, chunking if > 100
      const checkIds = checksWithStatus.map(c => c.id)
      const analyticsResults = await this.fetchBatchAnalytics(checkIds, range)
      const analyticsMap = new Map(analyticsResults.map(a => [a.checkId, a]))

      // Merge into stats rows
      const rows: StatsRow[] = checksWithStatus.map(c => ({
        ...c,
        analytics: analyticsMap.get(c.id),
      }))

      const pagination: PaginationInfo = { page, limit, total: totalChecks }

      // JSON output
      if (flags.output === 'json') {
        const totalPages = Math.ceil(totalChecks / limit)
        this.log(JSON.stringify({
          data: rows.map(r => ({
            checkId: r.id,
            name: r.name,
            checkType: r.checkType,
            activated: r.activated,
            status: r.status ? (r.status.hasFailures || r.status.hasErrors ? 'failing' : r.status.isDegraded ? 'degraded' : 'passing') : null,
            availability: r.analytics?.availability ?? null,
            responseTime_avg: r.analytics?.responseTime_avg ?? null,
            responseTime_p95: r.analytics?.responseTime_p95 ?? null,
            latency_avg: r.analytics?.latency_avg ?? null,
            packetLoss_avg: r.analytics?.packetLoss_avg ?? null,
          })),
          pagination: { page, limit, total: totalChecks, totalPages },
          range,
        }, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      // Markdown output
      if (fmt === 'md') {
        this.log(formatBatchStats(rows, range, fmt))
        return
      }

      // Terminal output
      const output: string[] = []
      output.push(formatSummaryBar(allChecks, allStatuses))
      output.push('')
      output.push(formatBatchStats(rows, range, fmt))
      output.push('')
      output.push(formatPaginationInfo(pagination))
      output.push('')

      // Build active filters for display
      const activeFilters: string[] = []
      if (flags.tag) activeFilters.push(...flags.tag.map(t => `tag=${t}`))
      if (flags.search) activeFilters.push(`search="${flags.search}"`)
      if (flags.type) activeFilters.push(`type=${flags.type}`)

      output.push(formatBatchStatsNavigationHints(pagination, range, activeFilters))

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to get check stats.', err)
      process.exitCode = 1
    }
  }

  private async fetchBatchAnalytics (checkIds: string[], range: BatchQuickRange) {
    const chunks: string[][] = []
    for (let i = 0; i < checkIds.length; i += MAX_BATCH_SIZE) {
      chunks.push(checkIds.slice(i, i + MAX_BATCH_SIZE))
    }

    const results = await Promise.all(
      chunks.map(chunk => api.batchAnalytics.get(chunk, range).then(r => r.data)),
    )

    return results.flat()
  }
}
