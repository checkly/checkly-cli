import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { OutputFormat } from '../../formatters/render'
import { formatIncidentDetail } from '../../formatters/incidents'
import {
  DEFAULT_CREATE_INCIDENT_MESSAGE,
  flattenStatusPageServices,
  incidentSeverityOptions,
  type IncidentSeverityOption,
  resolveIncidentServices,
  toIncidentSeverity,
} from '../../helpers/incidents'

export default class IncidentsCreate extends AuthCommand {
  static hidden = false
  static description = 'Declare a new incident on a status page.'

  static flags = {
    'status-page-id': Flags.string({
      description: 'Target status page ID.',
      required: true,
    }),
    'title': Flags.string({
      description: 'Incident title.',
      required: true,
    }),
    'services': Flags.string({
      description: 'Affected service IDs. Repeat the flag for multiple services.',
      multiple: true,
    }),
    'severity': Flags.string({
      description: 'Incident severity.',
      options: incidentSeverityOptions,
      default: 'minor',
    }),
    'message': Flags.string({
      description: 'Initial incident update message.',
    }),
    'notify-subscribers': Flags.boolean({
      description: 'Notify status page subscribers about this incident update.',
      default: true,
      allowNo: true,
    }),
    'output': outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(IncidentsCreate)
    this.style.outputFormat = flags.output

    try {
      const statusPage = await api.statusPages.get(flags['status-page-id'])
      const statusPageServices = flattenStatusPageServices(statusPage)
      const incidentServices = resolveIncidentServices(statusPageServices, flags.services)

      const incident = await api.incidents.create({
        name: flags.title,
        severity: toIncidentSeverity(flags.severity as IncidentSeverityOption),
        services: incidentServices,
        incidentUpdates: [{
          description: flags.message ?? DEFAULT_CREATE_INCIDENT_MESSAGE,
          status: 'INVESTIGATING',
          notifySubscribers: flags['notify-subscribers'],
        }],
      })

      if (flags.output === 'json') {
        this.log(JSON.stringify(incident, null, 2))
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      if (fmt === 'md') {
        this.log(formatIncidentDetail(incident, fmt))
        return
      }

      const output: string[] = []
      output.push(formatIncidentDetail(incident, fmt))
      output.push('')
      output.push(`  ${chalk.dim('Next:')}        checkly incidents update ${incident.id} --message "..."`)
      output.push(`  ${chalk.dim('Resolve:')}     checkly incidents resolve ${incident.id}`)

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to create incident.', err)
      process.exitCode = 1
    }
  }
}
