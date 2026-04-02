import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import { NotFoundError, InadequateEntitlementsError } from '../../rest/errors'
import { formatRcaPending, formatRcaCompleted } from '../../formatters/rca'

const POLL_INTERVAL_MS = 2000

export default class RcaRun extends AuthCommand {
  static hidden = false
  static readOnly = false
  static idempotent = false
  static description = 'Trigger a root cause analysis for an error group.'

  static flags = {
    'error-group': Flags.string({
      char: 'e',
      description: 'The error group ID to analyze.',
      required: true,
    }),
    'watch': Flags.boolean({
      char: 'w',
      description: 'Wait for the analysis to complete and display the result.',
      default: false,
    }),
    'output': outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(RcaRun)
    this.style.outputFormat = flags.output

    try {
      // Fetch the error group to get the checkId for navigation hints
      const { data: errorGroup } = await api.errorGroups.get(flags['error-group'])

      // Trigger the RCA
      const { data: { id: rcaId } } = await api.rca.trigger(flags['error-group'])

      const pendingInfo = {
        rcaId,
        errorGroupId: flags['error-group'],
        checkId: errorGroup.checkId,
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

      const rca = await this.pollUntilComplete(rcaId)

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
        this.style.shortError(`Error group not found: ${flags['error-group']}`)
        process.exitCode = 1
        return
      }
      this.style.longError('Failed to trigger root cause analysis.', err)
      process.exitCode = 1
    }
  }

  private async pollUntilComplete (rcaId: string) {
    while (true) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      const response = await api.rca.get(rcaId)
      if (response.status === 202) {
        continue
      }
      return response.data
    }
  }
}
