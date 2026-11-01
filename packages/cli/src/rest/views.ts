import type { AxiosInstance } from 'axios'

export type ViewPage = 'monitors' | 'testSessions'
export type ViewVisibility = 'PRIVATE' | 'ACCOUNT'
export type ViewCounter = 'total' | 'passing' | 'degraded' | 'failing'
export type ViewFilters = Record<string, unknown>

export interface ViewCreator {
  id: string
  name: string
  isMember: boolean
}

export interface View {
  id: string
  page: ViewPage
  name: string
  filters: ViewFilters
  counter: ViewCounter | null
  visibility: ViewVisibility
  createdBy: ViewCreator | null
  canUpdate: boolean
  canDelete: boolean
  canShare: boolean
  hidden: boolean
  created_at: string
  updated_at: string
}

export interface ViewListParams {
  page?: ViewPage
  visibility?: ViewVisibility
}

export interface CreateViewPayload {
  page: ViewPage
  name: string
  filters: ViewFilters
  counter?: ViewCounter
}

export interface UpdateViewPayload {
  name?: string
  filters?: ViewFilters
  counter?: ViewCounter | null
  visibility?: ViewVisibility
}

class Views {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async getAll (params: ViewListParams = {}): Promise<View[]> {
    const response = await this.api.get<View[]>('/v1/views', { params })
    return response.data
  }

  async get (id: string): Promise<View> {
    const response = await this.api.get<View>(`/v1/views/${id}`)
    return response.data
  }

  async create (payload: CreateViewPayload): Promise<View> {
    const response = await this.api.post<View>('/v1/views', payload)
    return response.data
  }

  async update (id: string, payload: UpdateViewPayload): Promise<View> {
    const response = await this.api.patch<View>(`/v1/views/${id}`, payload)
    return response.data
  }

  async delete (id: string): Promise<void> {
    await this.api.delete(`/v1/views/${id}`)
  }
}

export default Views
