import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { OutputFormat } from '../../formatters/render'
import { formatIncidentUpdateDetail } from '../../formatters/incidents'
import { DEFAULT_RESOLVE_INCIDENT_MESSAGE } from '../../helpers/incidents'

export default class IncidentsResolve extends AuthCommand {
  static hidden = false
  static description = 'Resolve an incident.'

  static args = {
    id: Args.string({
      description: 'The incident ID.',
      required: true,
    }),
  }

  static flags = {
    message: Flags.string({
      description: 'Optional closing note.',
    }),
    output: outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(IncidentsResolve)
    this.style.outputFormat = flags.output

    try {
      const update = await api.incidents.createUpdate(args.id, {
        description: flags.message ?? DEFAULT_RESOLVE_INCIDENT_MESSAGE,
        status: 'RESOLVED',
        notifySubscribers: false,
      })

      if (flags.output === 'json') {
        this.log(JSON.stringify(update, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      if (fmt === 'md') {
        this.log(formatIncidentUpdateDetail(args.id, update, fmt, 'Incident Resolved'))
        return
      }

      const output: string[] = []
      output.push(formatIncidentUpdateDetail(args.id, update, fmt, 'Incident Resolved'))
      output.push('')
      output.push(`  ${chalk.dim('List:')}        checkly incidents list --status resolved`)
      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to resolve incident.', err)
      process.exitCode = 1
    }
  }
}
