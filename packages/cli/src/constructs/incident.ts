import { StatusPageService } from './status-page-service'

type IncidentSeverity = 'MINOR' | 'MEDIUM' | 'MAJOR' | 'CRITICAL'

export interface IncidentTrigger {
  /** The status page service that this incident will be associated with. */
  service: StatusPageService
  /** The severity level of the incident. */
  severity: IncidentSeverity
  /** The name of the incident. */
  name: string
  /** A detailed description of the incident. */
  description: string
  /** Whether to notify subscribers when the incident is triggered. */
  notifySubscribers: boolean
}
