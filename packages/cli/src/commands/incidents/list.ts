import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { AuthCommand } from '../authCommand'
import { outputFlag } from '../../helpers/flags'
import * as api from '../../rest/api'
import type { StatusPageIncident } from '../../rest/incidents'
import type { OutputFormat } from '../../formatters/render'
import { formatIncidentsList } from '../../formatters/incidents'
import {
  filterIncidentsByStatus,
  flattenStatusPageServices,
  incidentListStatusOptions,
  type IncidentListStatusOption,
} from '../../helpers/incidents'

const FETCH_LIMIT = 100
const MAX_PAGES = 50

async function fetchAllIncidents (): Promise<StatusPageIncident[]> {
  const incidents: StatusPageIncident[] = []
  let nextId: string | undefined
  let pageCount = 0

  while (pageCount < MAX_PAGES) {
    const page = await api.incidents.getAll({ limit: FETCH_LIMIT, nextId })
    incidents.push(...page.entries)
    pageCount++
    nextId = page.nextId ?? undefined
    if (!nextId) break
  }

  return incidents
}

export default class IncidentsList extends AuthCommand {
  static hidden = false
  static readOnly = true
  static idempotent = true
  static description = 'List incidents, optionally filtered by status page or status.'

  static flags = {
    'status-page-id': Flags.string({
      description: 'Filter incidents by status page ID.',
    }),
    'status': Flags.string({
      description: 'Filter by incident status.',
      options: incidentListStatusOptions,
      default: 'open',
    }),
    'output': outputFlag({ default: 'table' }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(IncidentsList)
    this.style.outputFormat = flags.output

    try {
      let incidents = await fetchAllIncidents()
      incidents = filterIncidentsByStatus(incidents, flags.status as IncidentListStatusOption)

      if (flags['status-page-id']) {
        const statusPage = await api.statusPages.get(flags['status-page-id'])
        const statusPageServiceIds = new Set(flattenStatusPageServices(statusPage).map(service => service.id))
        incidents = incidents.filter(incident =>
          incident.services.some(service => statusPageServiceIds.has(service.id)),
        )
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify({ data: incidents, count: incidents.length }, null, 2))
        return
      }

      if (incidents.length === 0) {
        this.log('No incidents found.')
        return
      }

      const fmt: OutputFormat = flags.output === 'md' ? 'md' : 'terminal'
      if (fmt === 'md') {
        this.log(formatIncidentsList(incidents, fmt))
        return
      }

      const output: string[] = []
      output.push(formatIncidentsList(incidents, fmt))
      output.push('')

      const filters: string[] = []
      if (flags.status !== 'all') filters.push(`status=${flags.status}`)
      if (flags['status-page-id']) filters.push(`status-page-id=${flags['status-page-id']}`)

      const summary = `${incidents.length} incident${incidents.length === 1 ? '' : 's'}`
      if (filters.length > 0) {
        output.push(chalk.dim(`Showing ${summary} (${filters.join(', ')})`))
      } else {
        output.push(chalk.dim(`Showing ${summary}`))
      }

      this.log(output.join('\n'))
    } catch (err: any) {
      this.style.longError('Failed to list incidents.', err)
      process.exitCode = 1
    }
  }
}
