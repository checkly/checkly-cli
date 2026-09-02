import { Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import { validateIntegerRange } from '../../helpers/number.js'
import { describeUsageError, usageRangeFlags, usageRangeParams } from '../../helpers/usage.js'
import * as api from '../../rest/api.js'
import type { UsageGroupBy, UsageInterval } from '../../rest/usage.js'
import type { OutputFormat } from '../../formatters/render.js'
import {
  formatUsageSeries,
  formatUsageSeriesNavigationHints,
  formatUsageSeriesPaginationInfo,
  formatUsageWarnings,
} from '../../formatters/usage.js'

const INTERVALS: UsageInterval[] = ['total', 'day', 'week', 'month']
const GROUP_BY: UsageGroupBy[] = ['account', 'checkType', 'account,checkType']

// The API binds the cursor to every resolved query param, so the hint must
// repeat the flags verbatim. Values are validated enums, dates, and IDs.
function buildSeriesCommand (flags: Record<string, any>): string {
  const parts = [
    'checkly usage series',
    '--interval', flags.interval,
    '--group-by', flags['group-by'],
    '--limit', String(flags.limit),
  ]
  if (flags['usage-terms-id']) parts.push('--usage-terms-id', flags['usage-terms-id'])
  if (flags.from) parts.push('--from', flags.from)
  if (flags.to) parts.push('--to', flags.to)
  for (const accountId of flags['account-id'] ?? []) parts.push('--account-id', accountId)
  for (const checkType of flags['check-type'] ?? []) parts.push('--check-type', checkType)
  return parts.join(' ')
}

// A standalone function, not a private method: the command's `run` is invoked
// via `UsageSeriesCommand.prototype.run.call(ctx)` in tests with a plain
// context object, which does not inherit the class prototype's methods.
async function loadAccountNames (usageTermsId: string): Promise<Map<string, string>> {
  const { data: terms } = await api.usage.getTerms({ usageTermsId })
  return new Map(terms.accounts.map(account => [account.id, account.name]))
}

export default class UsageSeriesCommand extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'List organization usage per period, grouped by account and/or check type.'

  static flags = {
    ...usageRangeFlags(),
    'interval': Flags.string({
      description: 'Aggregation interval for each row.',
      options: INTERVALS,
      default: 'day',
    }),
    'group-by': Flags.string({
      description: 'Dimensions to group rows by.',
      options: GROUP_BY,
      default: 'account,checkType',
    }),
    'limit': Flags.integer({
      char: 'l',
      description: 'Number of rows to return (1-500).',
      default: 100,
    }),
    'cursor': Flags.string({
      description: 'Cursor for the next page (from previous output). Re-use the same flags it was issued with.',
    }),
    'output': outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(UsageSeriesCommand)
    this.style.outputFormat = flags.output

    try {
      const { data: series } = await api.usage.getSeries({
        ...usageRangeParams(flags),
        interval: flags.interval as UsageInterval,
        groupBy: flags['group-by'] as UsageGroupBy,
        limit: validateIntegerRange(flags.limit, '--limit', 1, 500),
        nextId: flags.cursor,
      })

      if (flags.output === 'json') {
        this.log(JSON.stringify({
          data: series.data,
          pagination: { nextId: series.nextId, length: series.length },
          usageTermsId: series.usageTermsId,
          period: series.period,
          warnings: series.warnings,
        }, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      const output: string[] = []

      const warnings = formatUsageWarnings(series.warnings, fmt)
      if (warnings) output.push(warnings, '')

      if (series.length === 0) {
        output.push('No usage rows found for the requested range.')
        this.log(output.join('\n'))
        return
      }

      const { interval, groupBy } = series.period
      const accountNames = groupBy.includes('account')
        ? await loadAccountNames(series.usageTermsId)
        : undefined
      output.push(formatUsageSeries(series.data, fmt, { interval, groupBy, accountNames }))

      if (fmt === 'md') {
        if (series.nextId) output.push('', `Next page cursor: \`${series.nextId}\``)
        this.log(output.join('\n'))
        return
      }

      output.push('', formatUsageSeriesPaginationInfo(series.length, series.nextId))
      const hints = formatUsageSeriesNavigationHints(series.nextId, buildSeriesCommand(flags))
      if (hints) output.push('', hints)

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to load usage series.', describeUsageError(err) ?? err)
      process.exitCode = 1
    }
  }
}
