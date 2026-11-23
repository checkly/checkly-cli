import { Args, Flags } from '@oclif/core'
import { AuthCommand } from '../../authCommand.js'
import { outputFlag } from '../../../helpers/flags.js'
import { describeUsageError, projectionsParams, validateUsageTermId } from '../../../helpers/usage.js'
import { exitCodeFor } from '../../../helpers/invalid-input-error.js'
import * as api from '../../../rest/api.js'
import { formatUsageProjections } from '../../../formatters/usage.js'

export default class UsageProjectionsCommand extends AuthCommand {
  static hidden = false
  static readOnly = true
  static destructive = false
  static idempotent = true
  static description = 'Project usage for a usage term through a completed UTC day. '
    + 'Defaults to the term in force today.'

  static args = {
    id: Args.string({ description: 'Usage term UUID. Defaults to the term in force today.', required: false }),
  }

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
      const usageTermsId = args.id === undefined ? undefined : validateUsageTermId(args.id)
      const { data: projections } = await api.usage.getProjections({
        ...(usageTermsId === undefined ? {} : { usageTermsId }),
        ...projectionsParams(flags),
      })
      if (flags.output === 'json') {
        this.log(JSON.stringify(projections, null, 2))
        return
      }
      const term = await api.usage.getTerm(projections.usageTermsId)
        .then(response => response.data).catch(() => undefined)
      this.log(formatUsageProjections(projections, flags.output === 'md' ? 'md' : 'terminal', term))
    } catch (err: unknown) {
      this.style.longError('Failed to load usage projections.', describeUsageError(err, {
        termId: args.id, inForceTerm: true,
      }))
      process.exitCode = exitCodeFor(err)
    }
  }
}
