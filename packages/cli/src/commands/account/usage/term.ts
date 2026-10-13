import { Args } from '@oclif/core'
import { AuthCommand } from '../../authCommand.js'
import { outputFlag } from '../../../helpers/flags.js'
import { describeUsageError, validateUsageTermId } from '../../../helpers/usage.js'
import * as api from '../../../rest/api.js'
import { formatUsageTermDetail } from '../../../formatters/usage.js'

export default class UsageTermCommand extends AuthCommand {
  static hidden = false
  static readOnly = true
  static destructive = false
  static idempotent = true
  static description = 'Show one usage term with pricing rules and covered accounts.'
  static args = { id: Args.string({ description: 'Usage term UUID.', required: true }) }
  static flags = { output: outputFlag({ default: 'detail' }) }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(UsageTermCommand)
    this.style.outputFormat = flags.output
    try {
      const id = validateUsageTermId(args.id)
      const { data: term } = await api.usage.getTerm(id)
      this.log(flags.output === 'json'
        ? JSON.stringify(term, null, 2)
        : formatUsageTermDetail(term, flags.output === 'md' ? 'md' : 'terminal'))
    } catch (err: unknown) {
      this.style.longError('Failed to load usage term.', describeUsageError(err, { termId: args.id }) ?? (err instanceof Error ? err : String(err)))
      process.exitCode = 1
    }
  }
}
