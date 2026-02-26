import type { AxiosInstance } from 'axios'

export interface StatusPageService {
  id: string
  name: string
}

export interface StatusPageCard {
  id: string
  name: string
  services: StatusPageService[]
}

export interface StatusPage {
  id: string
  name: string
  url: string
  customDomain: string | null
  isPrivate: boolean
  defaultTheme: string
  cards: StatusPageCard[]
  created_at: string
  updated_at: string | null
}

export interface StatusPageListParams {
  limit?: number
  nextId?: string
}

export interface PaginatedStatusPages {
  entries: StatusPage[]
  nextId: string | null
  length: number
}

class StatusPages {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async getAll (params: StatusPageListParams = {}): Promise<PaginatedStatusPages> {
    const response = await this.api.get<PaginatedStatusPages>('/v1/status-pages', { params })
    return response.data
  }

  async get (id: string): Promise<StatusPage> {
    const response = await this.api.get<StatusPage>(`/v1/status-pages/${id}`)
    return response.data
  }
}

export default StatusPages
