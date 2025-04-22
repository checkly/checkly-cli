import { StatusPageService } from './status-page-service'

type IncidentSeverity = 'MINOR' | 'MEDIUM' | 'MAJOR' | 'CRITICAL'

export interface IncidentTrigger {
  service: StatusPageService
  severity: IncidentSeverity
  name: string
  description: string
  notifySubscribers: boolean
}
