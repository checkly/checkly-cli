import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import { outputFlag, forceFlag, dryRunFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { OutputFormat } from '../../formatters/render'
import { formatIncidentUpdateDetail, formatIncidentSeverity } from '../../formatters/incidents'
import {
  incidentProgressStatusOptions,
  type IncidentProgressStatusOption,
  toIncidentProgressStatus,
  incidentSeverityOptions,
  type IncidentSeverityOption,
  toIncidentSeverity,
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
    'severity': Flags.string({
      description: 'Update the overall incident severity.',
      options: incidentSeverityOptions,
    }),
    'notify-subscribers': Flags.boolean({
      description: 'Notify status page subscribers about this incident update.',
      default: true,
      allowNo: true,
    }),
    'output': outputFlag({ default: 'table' }),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { args, flags } = await this.parse(IncidentsUpdate)
    this.style.outputFormat = flags.output

    const incident = await api.incidents.get(args.id)

    await this.confirmOrAbort({
      command: 'incidents update',
      description: 'Post progress update to incident',
      changes: [
        `Will post update to incident "${incident.name}" (${args.id})`,
        `Status: ${flags.status}`,
        flags['notify-subscribers']
          ? 'Will notify subscribers'
          : 'Subscribers will NOT be notified',
      ],
      flags,
      args: { id: args.id },
      classification: {
        readOnly: IncidentsUpdate.readOnly,
        destructive: IncidentsUpdate.destructive,
        idempotent: IncidentsUpdate.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    try {
      if (flags.severity) {
        await api.incidents.update(args.id, {
          severity: toIncidentSeverity(flags.severity as IncidentSeverityOption),
        })
      }

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
        const lines: string[] = []
        lines.push(formatIncidentUpdateDetail(args.id, update, fmt, 'Incident Update Posted'))
        if (flags.severity) {
          lines.push('')
          lines.push(`Severity updated to **${formatIncidentSeverity(toIncidentSeverity(flags.severity as IncidentSeverityOption), fmt)}**.`)
        }
        this.log(lines.join('\n'))
        return
      }

      const output: string[] = []
      output.push(formatIncidentUpdateDetail(args.id, update, fmt, 'Incident Update Posted'))
      if (flags.severity) {
        output.push(`  ${chalk.dim('Severity:')}   ${formatIncidentSeverity(toIncidentSeverity(flags.severity as IncidentSeverityOption), fmt)}`)
      }
      output.push('')
      output.push(`  ${chalk.dim('Resolve:')}     checkly incidents resolve ${args.id}`)
      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to post incident update.', err)
      process.exitCode = 1
    }
  }
}
