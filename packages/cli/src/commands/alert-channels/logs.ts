import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand.js'
import { outputFlag } from '../../helpers/flags.js'
import {
  parseNonNegativeInteger,
  parsePositiveInteger,
  validateIntegerRange,
} from '../../helpers/number.js'
import * as api from '../../rest/api.js'
import type { AlertNotificationListParams } from '../../rest/alert-notifications.js'
import type { OutputFormat } from '../../formatters/render.js'
import { formatAlertNotificationLogs } from '../../formatters/alert-channels.js'

export default class AlertChannelsLogs extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'List notification logs for an alert channel.'

  static args = {
    id: Args.string({
      description: 'The alert channel ID to retrieve logs for.',
      required: true,
    }),
  }

  static flags = {
    limit: Flags.integer({
      char: 'l',
      description: 'Number of logs to return (1-100).',
      default: 25,
    }),
    page: Flags.integer({
      char: 'p',
      description: 'Page number.',
      default: 1,
    }),
    from: Flags.integer({
      description: 'Unix timestamp for the start of the log window.',
    }),
    to: Flags.integer({
      description: 'Unix timestamp for the end of the log window.',
    }),
    status: Flags.string({
      char: 's',
      description: 'Filter logs by status.',
      options: ['failed'],
    }),
    output: outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(AlertChannelsLogs)
    this.style.outputFormat = flags.output

    try {
      const id = parsePositiveInteger(args.id, 'Alert channel ID')
      const limit = validateIntegerRange(flags.limit, 'Limit', 1, 100)
      const page = parsePositiveInteger(flags.page, 'Page')

      const params: AlertNotificationListParams = {
        alertChannelId: id,
        limit,
        page,
      }
      if (flags.from !== undefined) params.from = parseNonNegativeInteger(flags.from, 'From')
      if (flags.to !== undefined) params.to = parseNonNegativeInteger(flags.to, 'To')
      if (flags.status === 'failed') params.hasFailures = true

      const logs = await api.alertNotifications.getAll(params)
      const totalPages = Math.ceil(logs.total / limit)

      if (flags.output === 'json') {
        this.log(JSON.stringify({
          data: logs.data,
          pagination: { page, limit, total: logs.total, totalPages },
        }, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      if (fmt === 'md') {
        this.log(formatAlertNotificationLogs(logs.data, fmt))
        return
      }

      if (logs.data.length === 0) {
        this.log('No alert channel logs found.')
        return
      }

      const output: string[] = []
      output.push(formatAlertNotificationLogs(logs.data, fmt))
      output.push('')
      output.push(chalk.dim(`Showing ${logs.data.length} of ${logs.total} logs (page ${page}/${totalPages})`))

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to list alert channel logs.', err)
      process.exitCode = 1
    }
  }
}
