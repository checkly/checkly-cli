import { Args, Flags } from '@oclif/core'
import { AuthCommand } from '../../authCommand.js'
import { outputFlag } from '../../../helpers/flags.js'
import { describeUsageError, projectionsParams, validateUsageTermId } from '../../../helpers/usage.js'
import * as api from '../../../rest/api.js'
import { formatUsageProjections } from '../../../formatters/usage.js'

export default class UsageProjectionsCommand extends AuthCommand {
  static hidden = false
  static readOnly = true
  static destructive = false
  static idempotent = true
  static description = 'Project credit consumption for one usage term through a completed UTC day.'
  static args = { id: Args.string({ description: 'Usage term UUID.', required: true }) }
  static flags = {
    'as-of': Flags.string({
      description: 'Inclusive completed UTC date (YYYY-MM-DD). Defaults to yesterday UTC; today and future rejected.',
    }),
    'output': outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(UsageProjectionsCommand)
    this.style.outputFormat = flags.output
    try {
      const id = validateUsageTermId(args.id)
      const { data: projections } = await api.usage.getProjections(id, projectionsParams(flags))
      if (flags.output === 'json') {
        this.log(JSON.stringify(projections, null, 2))
        return
      }
      const { data: term } = await api.usage.getTerm(id)
      this.log(formatUsageProjections(projections, flags.output === 'md' ? 'md' : 'terminal', term))
    } catch (err: unknown) {
      this.style.longError('Failed to load usage projections.', describeUsageError(err, { termId: args.id }) ?? (err instanceof Error ? err : String(err)))
      process.exitCode = 1
    }
  }
}
