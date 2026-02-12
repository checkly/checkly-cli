import type { AxiosInstance } from 'axios'

export interface CheckDTO {
  id: string
  name: string
  checkType: string
  activated: boolean
  muted: boolean
  frequency: number
  locations: string[]
  privateLocations: string[]
  tags: string[]
  groupId: string | null
  runtimeId: string | null
  doubleCheck: boolean
  degradedResponseTime: number | null
  maxResponseTime: number | null
  createdAt: string
  updatedAt: string
}

export interface Pagination {
  nextCursor: string | null
  hasMore: boolean
}

export interface ResponseMeta {
  apiVersion: string
  stability: string
  requestId: string
}

export interface ChecksListResponse {
  data: CheckDTO[]
  pagination: Pagination
  meta: ResponseMeta
}

export interface ChecksListParams {
  limit?: number
  cursor?: string
  checkType?: string
  tag?: string
  muted?: boolean
  activated?: boolean
}

class Checks {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  /**
   * List all checks via the versioned API.
   * Automatically paginates through all results when no cursor is provided.
   */
  async list (params: ChecksListParams = {}) {
    const { data } = await this.api.get<ChecksListResponse>('/api/checks', { params })
    return data
  }

  /**
   * List all checks, automatically paginating through all pages.
   */
  async listAll (params: Omit<ChecksListParams, 'cursor'> = {}): Promise<CheckDTO[]> {
    const allChecks: CheckDTO[] = []
    let cursor: string | undefined

    do {
      const response = await this.list({ ...params, limit: 100, cursor })
      allChecks.push(...response.data)
      cursor = response.pagination.nextCursor ?? undefined
    } while (cursor)

    return allChecks
  }
}

export default Checks
