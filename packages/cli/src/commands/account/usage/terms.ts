import { AuthCommand } from '../../authCommand.js'
import { outputFlag } from '../../../helpers/flags.js'
import { describeUsageError, usageTermsFlags, usageTermsParams } from '../../../helpers/usage.js'
import * as api from '../../../rest/api.js'
import { type OutputFormat, renderCommandHints } from '../../../formatters/render.js'
import { formatUsageTermsDetail } from '../../../formatters/usage.js'

export default class UsageTermsCommand extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Show your organization usage terms: contract dates, credit budget, rates, and accounts.'

  static flags = {
    ...usageTermsFlags(),
    output: outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(UsageTermsCommand)
    this.style.outputFormat = flags.output

    try {
      const { data: terms } = await api.usage.getTerms(usageTermsParams(flags))

      if (flags.output === 'json') {
        this.log(JSON.stringify(terms, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      if (fmt === 'md') {
        this.log(formatUsageTermsDetail(terms, fmt))
        return
      }

      const output: string[] = []
      output.push(formatUsageTermsDetail(terms, fmt))
      output.push('')
      output.push(renderCommandHints([
        { label: 'Summary', command: `checkly account usage summary --usage-terms-id ${terms.id}` },
        {
          label: 'Monthly by account',
          command: `checkly account usage series --usage-terms-id ${terms.id} --interval month --group-by account`,
        },
      ], { gap: 1 }))

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to load usage terms.', describeUsageError(err) ?? err)
      process.exitCode = 1
    }
  }
}
