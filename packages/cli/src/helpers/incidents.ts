import type { IncidentService, IncidentSeverity, IncidentUpdateStatus, StatusPageIncident } from '../rest/incidents'
import type { StatusPage, StatusPageService } from '../rest/status-pages'

export const incidentSeverityOptions = ['minor', 'medium', 'major', 'critical'] as const
export type IncidentSeverityOption = (typeof incidentSeverityOptions)[number]

export const incidentProgressStatusOptions = ['investigating', 'identified', 'monitoring'] as const
export type IncidentProgressStatusOption = (typeof incidentProgressStatusOptions)[number]

export const incidentListStatusOptions = ['open', 'resolved', 'all'] as const
export type IncidentListStatusOption = (typeof incidentListStatusOptions)[number]

export const DEFAULT_CREATE_INCIDENT_MESSAGE = 'We are investigating this incident.'
export const DEFAULT_RESOLVE_INCIDENT_MESSAGE = 'Incident resolved.'

export function toIncidentSeverity (value: IncidentSeverityOption): IncidentSeverity {
  return value.toUpperCase() as IncidentSeverity
}

export function toIncidentProgressStatus (value: IncidentProgressStatusOption): IncidentUpdateStatus {
  return value.toUpperCase() as IncidentUpdateStatus
}

export function flattenStatusPageServices (statusPage: StatusPage): StatusPageService[] {
  return statusPage.cards.flatMap(card => card.services)
}

export function resolveIncidentServices (
  statusPageServices: StatusPageService[],
  selectedServiceIds?: string[],
): IncidentService[] {
  if (statusPageServices.length === 0) {
    throw new Error('This status page has no services. Add services to the status page first.')
  }

  let selectedServices: StatusPageService[]
  if (!selectedServiceIds || selectedServiceIds.length === 0) {
    selectedServices = statusPageServices
  } else {
    const serviceMap = new Map(statusPageServices.map(service => [service.id, service]))
    const missing = selectedServiceIds.filter(id => !serviceMap.has(id))
    if (missing.length > 0) {
      throw new Error(
        `Unknown service IDs for this status page: ${missing.join(', ')}`,
      )
    }
    selectedServices = selectedServiceIds.map(id => serviceMap.get(id) as StatusPageService)
  }

  return selectedServices.map(service => {
    if (!service.accountId) {
      throw new Error(
        `Service "${service.name}" (${service.id}) is missing account metadata from the API response.`,
      )
    }

    return {
      id: service.id,
      name: service.name,
      accountId: service.accountId,
    }
  })
}

export function filterIncidentsByStatus (
  incidents: StatusPageIncident[],
  status: IncidentListStatusOption,
): StatusPageIncident[] {
  if (status === 'all') return incidents
  if (status === 'resolved') {
    return incidents.filter(incident => incident.lastUpdateStatus === 'RESOLVED')
  }
  return incidents.filter(incident => incident.lastUpdateStatus !== 'RESOLVED')
}
