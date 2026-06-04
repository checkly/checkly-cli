import { Flags } from '@oclif/core'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import { validateIntegerRange } from '../../helpers/number.js'
import * as api from '../../rest/api.js'
import type { OutputFormat } from '../../formatters/render.js'
import {
  formatAlertChannelNavigationHints,
  formatAlertChannelPaginationInfo,
  formatAlertChannels,
} from '../../formatters/alert-channels.js'

export default class AlertChannelsList extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'List all alert channels in your account.'

  static flags = {
    limit: Flags.integer({
      char: 'l',
      description: 'Number of alert channels to return (1-100).',
      default: 25,
    }),
    page: Flags.integer({
      char: 'p',
      description: 'Page number.',
      default: 1,
    }),
    output: outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(AlertChannelsList)
    this.style.outputFormat = flags.output

    try {
      const limit = validateIntegerRange(flags.limit, 'Limit', 1, 100)
      const page = validateIntegerRange(flags.page, 'Page', 1, Number.MAX_SAFE_INTEGER)
      const paginated = await api.alertChannels.getAllPaginated({ limit, page })
      const pagination = { page, limit, total: paginated.total }

      if (flags.output === 'json') {
        const totalPages = Math.ceil(paginated.total / limit)
        this.log(JSON.stringify({
          data: paginated.alertChannels,
          pagination: { page, limit, total: paginated.total, totalPages },
        }, null, 2))
        return
      }

      if (paginated.total === 0) {
        this.log('No alert channels found.')
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'

      if (fmt === 'md') {
        this.log(formatAlertChannels(paginated.alertChannels, fmt))
        return
      }

      const output: string[] = []
      output.push(formatAlertChannels(paginated.alertChannels, fmt))
      output.push('')
      output.push(formatAlertChannelPaginationInfo(pagination))
      output.push('')
      output.push(formatAlertChannelNavigationHints(pagination))

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to list alert channels.', err)
      process.exitCode = 1
    }
  }
}
