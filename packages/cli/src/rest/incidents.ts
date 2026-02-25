import type { AxiosInstance } from 'axios'

export type IncidentSeverity = 'CRITICAL' | 'MAJOR' | 'MEDIUM' | 'MINOR'
export type IncidentUpdateStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED'

export interface IncidentService {
  id: string
  name: string
  accountId?: string
}

export interface IncidentUpdate {
  id?: string
  description: string
  status: IncidentUpdateStatus
  publicIncidentUpdateDate?: string
  created_at?: string
  notifySubscribers?: boolean
}

export interface StatusPageIncident {
  id: string
  name: string
  severity: IncidentSeverity
  lastUpdateStatus: IncidentUpdateStatus
  services: IncidentService[]
  incidentUpdates: IncidentUpdate[]
  created_at: string
  updated_at: string | null
}

export interface IncidentListParams {
  limit?: number
  nextId?: string
}

export interface PaginatedIncidents {
  entries: StatusPageIncident[]
  nextId: string | null
  length: number
}

export interface CreateIncidentPayload {
  name: string
  severity: IncidentSeverity
  services: IncidentService[]
  incidentUpdates: [IncidentUpdate]
}

export interface CreateIncidentUpdatePayload {
  description: string
  status: IncidentUpdateStatus
  notifySubscribers?: boolean
  publicIncidentUpdateDate?: string
}

class Incidents {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async getAll (params: IncidentListParams = {}): Promise<PaginatedIncidents> {
    const response = await this.api.get<PaginatedIncidents>('/v1/status-pages/incidents', { params })
    return response.data
  }

  async get (id: string): Promise<StatusPageIncident> {
    const response = await this.api.get<StatusPageIncident>(`/v1/status-pages/incidents/${id}`)
    return response.data
  }

  async create (payload: CreateIncidentPayload): Promise<StatusPageIncident> {
    const response = await this.api.post<StatusPageIncident>('/v1/status-pages/incidents', payload)
    return response.data
  }

  async createUpdate (incidentId: string, payload: CreateIncidentUpdatePayload): Promise<IncidentUpdate> {
    const response = await this.api.post<IncidentUpdate>(`/v1/status-pages/incidents/${incidentId}/incident-updates`, payload)
    return response.data
  }
}

export default Incidents
