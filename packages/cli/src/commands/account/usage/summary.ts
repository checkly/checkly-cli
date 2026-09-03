import { AuthCommand } from '../../authCommand.js'
import { outputFlag } from '../../../helpers/flags.js'
import { describeUsageError, usageRangeFlags, usageRangeParams, usageTermsParams } from '../../../helpers/usage.js'
import * as api from '../../../rest/api.js'
import { type OutputFormat, renderCommandHints } from '../../../formatters/render.js'
import { formatUsageSummary } from '../../../formatters/usage.js'

export default class UsageSummaryCommand extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Show organization usage totals, credit consumption, and projections for a date range.'

  static flags = {
    ...usageRangeFlags(),
    output: outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(UsageSummaryCommand)
    this.style.outputFormat = flags.output

    try {
      if (flags.output === 'json') {
        const { data: summary } = await api.usage.getSummary(usageRangeParams(flags))
        this.log(JSON.stringify(summary, null, 2))
        return
      }

      // The summary carries no organization name or budget; the terms do.
      const [{ data: summary }, { data: terms }] = await Promise.all([
        api.usage.getSummary(usageRangeParams(flags)),
        api.usage.getTerms(usageTermsParams(flags)),
      ])
      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      if (fmt === 'md') {
        this.log(formatUsageSummary(summary, fmt, terms))
        return
      }

      const output: string[] = []
      output.push(formatUsageSummary(summary, fmt, terms))
      output.push('')
      output.push(renderCommandHints([
        { label: 'Daily series', command: 'checkly account usage series --interval day' },
        { label: 'Monthly by account', command: 'checkly account usage series --interval month --group-by account' },
        { label: 'Terms', command: 'checkly account usage terms' },
      ], { gap: 1 }))

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to load usage summary.', describeUsageError(err) ?? err)
      process.exitCode = 1
    }
  }
}
