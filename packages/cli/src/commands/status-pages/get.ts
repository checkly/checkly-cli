import { Args } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { OutputFormat } from '../../formatters/render'
import { formatStatusPageDetail } from '../../formatters/status-pages'

export default class StatusPagesGet extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Get details of a status page, including its cards and services.'

  static args = {
    id: Args.string({
      description: 'The ID of the status page to retrieve.',
      required: true,
    }),
  }

  static flags = {
    output: outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(StatusPagesGet)
    this.style.outputFormat = flags.output

    try {
      const statusPage = await api.statusPages.get(args.id)

      if (flags.output === 'json') {
        this.log(JSON.stringify(statusPage, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      if (fmt === 'md') {
        this.log(formatStatusPageDetail(statusPage, fmt))
        return
      }

      const output: string[] = []
      output.push(formatStatusPageDetail(statusPage, fmt))

      // Navigation hints
      output.push('')
      output.push(`  ${chalk.dim('Back to list:')}   checkly status-pages list`)

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to get status page details.', err)
      process.exitCode = 1
    }
  }
}
