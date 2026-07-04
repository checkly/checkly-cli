import type { AxiosInstance } from 'axios'

export const resourceExportTypes = [
  'alert-channel',
  'alert-channel-subscription',
  'check',
  'check-group',
  'dashboard',
  'maintenance-window',
  'private-location',
  'private-location-check-assignment',
  'private-location-group-assignment',
  'status-page',
  'status-page-service',
] as const

export type ResourceExportType = typeof resourceExportTypes[number]

export interface ResourceCodeExportTarget {
  type: ResourceExportType
  id: string | number
}

export interface ResourceCodeExportRequest {
  resources?: ResourceCodeExportTarget[]
  types?: ResourceExportType[]
  updatedAfter?: string
  projectLogicalId?: string
  codeManagedOnly?: boolean
}

export interface ResourceCodeExportFile {
  path: string
  content: string
  role?: 'main' | 'support' | 'spec' | string
}

export interface ResourceCodeExportMetadata {
  type: ResourceExportType
  id: string | number
  name?: string
  updatedAt?: string | null
  codeManaged?: boolean
  projectLogicalId?: string
  logicalId?: string
}

export interface ResourceCodeExportSkipped {
  type?: ResourceExportType
  id?: string | number
  reason: string
}

export interface ResourceCodeExportError {
  type?: ResourceExportType
  id?: string | number
  message: string
}

export interface ResourceCodeExportResponse {
  files: ResourceCodeExportFile[]
  resources?: ResourceCodeExportMetadata[]
  skipped?: ResourceCodeExportSkipped[]
  errors?: ResourceCodeExportError[]
}

class Resources {
  api: AxiosInstance

  constructor (api: AxiosInstance) {
    this.api = api
  }

  async exportCode (payload: ResourceCodeExportRequest): Promise<ResourceCodeExportResponse> {
    const response = await this.api.post<ResourceCodeExportResponse>('/v1/resources/code-export', payload)
    return response.data
  }
}

export default Resources
