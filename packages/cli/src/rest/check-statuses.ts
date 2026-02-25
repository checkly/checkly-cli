import type { AxiosInstance } from 'axios'

export interface CheckStatus {
  name: string
  checkId: string
  hasFailures: boolean
  hasErrors: boolean
  isDegraded: boolean
  longestRun: number
  shortestRun: number
  lastRunLocation: string
  lastCheckRunId: string
  sslDaysRemaining: number | null
  created_at: string
  updated_at: string | null
}

class CheckStatuses {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<CheckStatus[]>('/v1/check-statuses')
  }

  async fetchAll (): Promise<CheckStatus[]> {
    // The check-statuses endpoint returns all entries regardless of limit param,
    // so a single request is sufficient.
    const resp = await this.api.get<CheckStatus[]>('/v1/check-statuses')
    return resp.data
  }

  get (checkId: string) {
    return this.api.get<CheckStatus>(`/v1/check-statuses/${checkId}`)
  }
}

export default CheckStatuses
