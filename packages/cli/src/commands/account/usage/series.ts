import { AuthCommand } from '../../authCommand.js'
import { outputFlag } from '../../../helpers/flags.js'
import { describeUsageError, loadUsageNames, usageSeriesFlags, usageSeriesParams } from '../../../helpers/usage.js'
import * as api from '../../../rest/api.js'
import { heading, type OutputFormat } from '../../../formatters/render.js'
import {
  formatUsageCoverage, formatUsageSeries, formatUsagePaginationInfo, formatUsageNavigationHints, usageListCommand,
} from '../../../formatters/usage.js'

export default class UsageSeriesCommand extends AuthCommand {
  static hidden = false
  static readOnly = true
  static destructive = false
  static idempotent = true
  static description = 'List usage credits per period with composable grouping and optional runs or calculations.'
  static flags = { ...usageSeriesFlags(), output: outputFlag({ default: 'table' }) }

  async run (): Promise<void> {
    const { flags } = await this.parse(UsageSeriesCommand)
    this.style.outputFormat = flags.output
    try {
      const params = usageSeriesParams(flags)
      const { data: series } = await api.usage.getSeries(params)
      if (flags.output === 'json') {
        this.log(JSON.stringify({
          data: series.data,
          pagination: { nextId: series.nextId, length: series.data.length },
          period: series.period,
          usageTermsIds: series.usageTermsIds,
          interval: series.interval,
          groupBy: series.groupBy,
          coverage: series.coverage,
        }, null, 2))
        return
      }
      const wantsNames = series.data.length > 0
        && (series.groupBy.includes('account') || series.groupBy.includes('usageTerm'))
      const names = wantsNames ? await loadUsageNames(series.usageTermsIds) : undefined
      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      const pinned = { ...params, ...series.period, interval: series.interval, groupBy: series.groupBy }
      this.log([
        fmt === 'md' ? heading('Usage series', 1, fmt) : '',
        formatUsageCoverage(series.coverage, fmt),
        fmt === 'md' ? heading('Usage rows', 2, fmt) : '',
        formatUsageSeries(series.data, fmt, {
          interval: series.interval, groupBy: series.groupBy, include: params.include ?? [], names,
        }),
        formatUsagePaginationInfo(series.data.length, series.nextId, 'usage row'),
        formatUsageNavigationHints(series.nextId, usageListCommand('series', pinned), fmt),
      ].filter(Boolean).join('\n\n'))
    } catch (err: unknown) {
      this.style.longError('Failed to load usage series.', describeUsageError(err) ?? (err instanceof Error ? err : String(err)))
      process.exitCode = 1
    }
  }
}
