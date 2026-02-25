import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { OutputFormat } from '../../formatters/render'
import { formatIncidentUpdateDetail } from '../../formatters/incidents'
import {
  incidentProgressStatusOptions,
  type IncidentProgressStatusOption,
  toIncidentProgressStatus,
} from '../../helpers/incidents'

export default class IncidentsUpdate extends AuthCommand {
  static hidden = false
  static description = 'Post a progress update to an incident.'

  static args = {
    id: Args.string({
      description: 'The incident ID.',
      required: true,
    }),
  }

  static flags = {
    'message': Flags.string({
      description: 'Update message.',
      required: true,
    }),
    'status': Flags.string({
      description: 'Incident progress status.',
      options: incidentProgressStatusOptions,
      default: 'investigating',
    }),
    'notify-subscribers': Flags.boolean({
      description: 'Notify status page subscribers about this incident update.',
      default: true,
      allowNo: true,
    }),
    'output': outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(IncidentsUpdate)
    this.style.outputFormat = flags.output

    try {
      const update = await api.incidents.createUpdate(args.id, {
        description: flags.message,
        status: toIncidentProgressStatus(flags.status as IncidentProgressStatusOption),
        notifySubscribers: flags['notify-subscribers'],
      })

      if (flags.output === 'json') {
        this.log(JSON.stringify(update, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      if (fmt === 'md') {
        this.log(formatIncidentUpdateDetail(args.id, update, fmt, 'Incident Update Posted'))
        return
      }

      const output: string[] = []
      output.push(formatIncidentUpdateDetail(args.id, update, fmt, 'Incident Update Posted'))
      output.push('')
      output.push(`  ${chalk.dim('Resolve:')}     checkly incidents resolve ${args.id}`)
      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to post incident update.', err)
      process.exitCode = 1
    }
  }
}
