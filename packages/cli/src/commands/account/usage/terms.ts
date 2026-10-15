import { AuthCommand } from '../../authCommand.js'
import { outputFlag } from '../../../helpers/flags.js'
import { describeUsageError, usageTermsListFlags, usageTermsParams } from '../../../helpers/usage.js'
import * as api from '../../../rest/api.js'
import type { OutputFormat } from '../../../formatters/render.js'
import {
  formatUsageTermsList, formatUsagePaginationInfo, formatUsageNavigationHints,
  usageListCommand,
} from '../../../formatters/usage.js'

export default class UsageTermsCommand extends AuthCommand {
  static hidden = false
  static readOnly = true
  static destructive = false
  static idempotent = true
  static description = 'List organization usage terms, optionally overlapping a UTC date range.'

  static flags = {
    ...usageTermsListFlags(),
    output: outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(UsageTermsCommand)
    this.style.outputFormat = flags.output
    try {
      const params = usageTermsParams(flags)
      const { data: terms } = await api.usage.listTerms(params)
      if (flags.output === 'json') {
        this.log(JSON.stringify({
          data: terms.data,
          pagination: { nextId: terms.nextId, length: terms.data.length },
        }, null, 2))
        return
      }
      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      this.log([
        formatUsageTermsList(terms.data, fmt),
        formatUsagePaginationInfo(terms.data.length, terms.nextId, 'usage term'),
        formatUsageNavigationHints(terms.nextId, usageListCommand('terms', params, fmt), fmt),
      ].filter(Boolean).join('\n\n'))
    } catch (err: unknown) {
      this.style.longError('Failed to load usage terms.', describeUsageError(err))
      process.exitCode = 1
    }
  }
}
