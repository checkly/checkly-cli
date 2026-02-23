import type { AxiosInstance } from 'axios'

export interface Check {
  id: string
  name: string
  checkType: string
  activated: boolean
  muted: boolean
  frequency: number | null
  frequencyOffset?: number
  locations: string[]
  privateLocations?: string[]
  tags: string[]
  groupId: number | null
  groupOrder: number | null
  runtimeId: string | null
  scriptPath: string | null
  request?: { url: string, method: string }
  created_at: string
  updated_at: string | null
}

export interface ListChecksParams {
  limit?: number
  page?: number
  tag?: string[]
}

export interface PaginatedChecks {
  checks: Check[]
  total: number
  page: number
  limit: number
}

function parseTotalFromContentRange (header: string | undefined): number | null {
  if (!header) return null
  // Content-Range format: "0-24/300" or "*/0"
  const match = header.match(/\/(\d+)$/)
  return match ? parseInt(match[1], 10) : null
}

class Checks {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll (params: ListChecksParams = {}) {
    return this.api.get<Check[]>('/v1/checks', { params })
  }

  async getAllPaginated (params: ListChecksParams = {}): Promise<PaginatedChecks> {
    const response = await this.api.get<Check[]>('/v1/checks', { params })
    const total = parseTotalFromContentRange(response.headers['content-range']) ?? response.data.length
    return {
      checks: response.data,
      total,
      page: params.page ?? 1,
      limit: params.limit ?? 10,
    }
  }

  async fetchAll (params: Omit<ListChecksParams, 'page' | 'limit'> = {}): Promise<Check[]> {
    const pageSize = 100
    const first = await this.getAllPaginated({ ...params, page: 1, limit: pageSize })
    const allChecks = [...first.checks]

    if (first.total <= pageSize) return allChecks

    const totalPages = Math.ceil(first.total / pageSize)
    const remaining = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        this.api.get<Check[]>('/v1/checks', {
          params: { ...params, page: i + 2, limit: pageSize },
        }).then(r => r.data),
      ),
    )
    for (const page of remaining) {
      allChecks.push(...page)
    }

    return allChecks
  }

  get (id: string) {
    return this.api.get<Check>(`/v1/checks/${id}`)
  }
}

export default Checks
