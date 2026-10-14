import { AuthCommand } from '../../authCommand.js'
import { outputFlag } from '../../../helpers/flags.js'
import { describeUsageError, usageRangeFlags, usageRangeParams } from '../../../helpers/usage.js'
import * as api from '../../../rest/api.js'
import { type OutputFormat, renderCommandHints } from '../../../formatters/render.js'
import { formatUsageSummary, usageListCommand } from '../../../formatters/usage.js'

export default class UsageSummaryCommand extends AuthCommand {
  static hidden = false
  static readOnly = true
  static destructive = false
  static idempotent = true
  static description = 'Show usage credits, pricing breakdowns, and coverage gaps across selected terms.'
  static flags = { ...usageRangeFlags(), output: outputFlag({ default: 'detail' }) }

  async run (): Promise<void> {
    const { flags } = await this.parse(UsageSummaryCommand)
    this.style.outputFormat = flags.output
    try {
      const params = usageRangeParams(flags)
      const { data: summary } = await api.usage.getSummary(params)
      if (flags.output === 'json') {
        this.log(JSON.stringify(summary, null, 2))
        return
      }
      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      const output = [formatUsageSummary(summary, fmt)]
      if (fmt === 'terminal') {
        output.push(renderCommandHints([
          { label: 'Daily series', command: usageListCommand('series', {
            ...params, ...summary.period, interval: 'day', groupBy: ['account', 'checkType'],
          }, fmt) },
          { label: 'Terms', command: 'checkly account usage terms' },
        ], { gap: 1 }))
      }
      this.log(output.join('\n\n'))
    } catch (err: unknown) {
      this.style.longError('Failed to load usage summary.', describeUsageError(err))
      process.exitCode = 1
    }
  }
}
