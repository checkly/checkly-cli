import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand.js'
import { normalizeFlagAliases, outputFlag } from '../../helpers/flags.js'
import * as api from '../../rest/api.js'
import { NotFoundError, InadequateEntitlementsError } from '../../rest/errors.js'
import { formatRcaPending, formatRcaCompleted } from '../../formatters/rca.js'

export default class RcaRun extends AuthCommand {
  static hidden = false
  static readOnly = false
  static idempotent = false
  static description = 'Trigger a root cause analysis for a check or test session error group.'
  static usage = 'rca run [-e <value> | -te <value>] [--user-context <text>] [-w] [-o detail|json|md]'

  static flags = {
    'error-group': Flags.string({
      char: 'e',
      description: 'The error group ID to analyze.',
      exactlyOne: ['error-group', 'test-session-error-group'],
      exclusive: ['test-session-error-group'],
    }),
    'test-session-error-group': Flags.string({
      description: 'The test session error group ID to analyze.',
      helpLabel: '-te, --test-session-error-group',
    }),
    'user-context': Flags.string({
      description: 'Extra context to pass into the root cause analysis.',
    }),
    'watch': Flags.boolean({
      char: 'w',
      description: 'Wait for the analysis to complete and display the result.',
      default: false,
    }),
    'output': outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(RcaRun, normalizeFlagAliases(this.argv, [
      { alias: '-te', flag: '--test-session-error-group' },
    ]))
    this.style.outputFormat = flags.output

    const source = flags['test-session-error-group']
      ? {
          type: 'test-session-error-group' as const,
          id: flags['test-session-error-group'],
        }
      : {
          type: 'error-group' as const,
          id: flags['error-group']!,
        }

    try {
      let pendingInfo
      let rcaId: string

      if (source.type === 'error-group') {
        // Fetch the error group to get the checkId for navigation hints
        const { data: errorGroup } = await api.errorGroups.get(source.id)

        const response = await api.rca.trigger(source.id, flags['user-context'])
        rcaId = response.data.id
        pendingInfo = {
          rcaId,
          source: {
            type: 'error-group' as const,
            errorGroupId: source.id,
            checkId: errorGroup.checkId,
          },
        }
      } else {
        await api.testSessionErrorGroups.get(source.id)

        const response = await api.rca.triggerTestSessionErrorGroup(source.id, flags['user-context'])
        rcaId = response.data.id
        pendingInfo = {
          rcaId,
          source: {
            type: 'test-session-error-group' as const,
            testSessionErrorGroupId: source.id,
          },
        }
      }

      // If not watching, show pending state and exit
      if (!flags.watch || flags.output === 'json' || flags.output === 'md') {
        if (flags.watch && flags.output !== 'detail') {
          process.stderr.write(`--watch is not supported with --output ${flags.output}, ignoring\n`)
        }
        const fmt = flags.output === 'json' ? 'json' : flags.output === 'md' ? 'md' : 'terminal'
        this.log(formatRcaPending(pendingInfo, fmt))
        return
      }

      // Watch mode: poll until complete
      this.log(chalk.bold('Root cause analysis triggered.'))
      this.log(`${chalk.dim('RCA ID:')}  ${rcaId}`)
      this.log('')
      this.style.actionStart('Waiting for root cause analysis...')

      const rca = await api.rca.pollUntilComplete(rcaId)

      this.style.actionSuccess()
      this.log(formatRcaCompleted(rca, 'terminal'))
    } catch (err: any) {
      if (err instanceof InadequateEntitlementsError) {
        this.style.longError(
          'Root cause analysis is not available on your current plan.',
          'Run `checkly account plan` to check your entitlements.',
        )
        process.exitCode = 1
        return
      }
      if (err instanceof NotFoundError) {
        const label = source.type === 'error-group' ? 'Error group' : 'Test session error group'
        this.style.shortError(`${label} not found: ${source.id}`)
        process.exitCode = 1
        return
      }
      this.style.longError('Failed to trigger root cause analysis.', err)
      process.exitCode = 1
    }
  }
}
