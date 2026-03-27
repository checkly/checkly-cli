import { Args, Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import { NotFoundError } from '../../rest/errors'
import { formatRcaCompleted } from '../../formatters/rca'

const POLL_INTERVAL_MS = 2000

export default class RcaGet extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Retrieve a root cause analysis by ID.'

  static args = {
    id: Args.string({
      description: 'The RCA ID to retrieve.',
      required: true,
    }),
  }

  static flags = {
    watch: Flags.boolean({
      char: 'w',
      description: 'Wait for the analysis to complete if still generating.',
      default: false,
    }),
    output: outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(RcaGet)
    this.style.outputFormat = flags.output

    try {
      // Try to fetch the RCA directly
      try {
        const { data: rca } = await api.rca.get(args.id)
        const fmt = flags.output === 'json' ? 'json' : flags.output === 'md' ? 'md' : 'terminal'
        this.log(formatRcaCompleted(rca, fmt))
        return
      } catch (err: any) {
        if (!(err instanceof NotFoundError)) {
          throw err
        }

        // 404 — either doesn't exist or still generating
        if (!flags.watch) {
          if (flags.output === 'json') {
            this.log(JSON.stringify({ id: args.id, status: 'pending' }, null, 2))
          } else {
            this.log('Root cause analysis is still being generated.')
            this.log(`Use ${this.config.bin} rca get ${args.id} --watch to wait for completion.`)
          }
          return
        }

        if (flags.output !== 'detail') {
          process.stderr.write(`--watch is not supported with --output ${flags.output}, ignoring\n`)
          if (flags.output === 'json') {
            this.log(JSON.stringify({ id: args.id, status: 'pending' }, null, 2))
          } else {
            this.log('Root cause analysis is still being generated.')
          }
          return
        }
      }

      // Watch mode: poll until complete
      this.style.actionStart('Waiting for root cause analysis...')

      const rca = await this.pollUntilComplete(args.id)

      this.style.actionSuccess()
      this.log(formatRcaCompleted(rca, 'terminal'))
    } catch (err: any) {
      this.style.longError('Failed to retrieve root cause analysis.', err)
      process.exitCode = 1
    }
  }

  private async pollUntilComplete (rcaId: string) {
    while (true) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      try {
        const { data } = await api.rca.get(rcaId)
        return data
      } catch (err: any) {
        if (err instanceof NotFoundError) {
          continue
        }
        throw err
      }
    }
  }
}
