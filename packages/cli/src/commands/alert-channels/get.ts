import { Args } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import { parsePositiveInteger } from '../../helpers/number.js'
import * as api from '../../rest/api.js'
import type { OutputFormat } from '../../formatters/render.js'
import { formatAlertChannelDetail } from '../../formatters/alert-channels.js'

export default class AlertChannelsGet extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'Get details of an alert channel.'

  static args = {
    id: Args.string({
      description: 'The alert channel ID to retrieve.',
      required: true,
    }),
  }

  static flags = {
    output: outputFlag({ default: 'detail' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(AlertChannelsGet)
    this.style.outputFormat = flags.output

    try {
      const id = parsePositiveInteger(args.id, 'Alert channel ID')
      const alertChannel = await api.alertChannels.get(id)

      if (flags.output === 'json') {
        this.log(JSON.stringify(alertChannel, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      if (fmt === 'md') {
        this.log(formatAlertChannelDetail(alertChannel, fmt))
        return
      }

      const output: string[] = []
      output.push(formatAlertChannelDetail(alertChannel, fmt))
      output.push('')
      output.push(`  ${chalk.dim('View logs:')}    checkly alert-channels logs ${id}`)
      output.push(`  ${chalk.dim('Back to list:')} checkly alert-channels list`)

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to get alert channel details.', err)
      process.exitCode = 1
    }
  }
}
