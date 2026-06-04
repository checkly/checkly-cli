import type { AxiosInstance } from 'axios'
import { parseTotalFromContentRange } from '../helpers/content-range.js'

export type AlertChannelType =
  | 'CALL'
  | 'EMAIL'
  | 'OPSGENIE'
  | 'PAGERDUTY'
  | 'SLACK'
  | 'SLACK_APP'
  | 'SMS'
  | 'WEBHOOK'

export interface AlertChannelSubscription {
  id?: string | number
  checkId?: string | null
  checkName?: string
  groupId?: number | null
  groupName?: string
  activated?: boolean
  check?: {
    id?: string
    name?: string
  }
  group?: {
    id?: number
    name?: string
  }
}

export interface AlertChannel {
  id: number
  type: AlertChannelType | string
  name?: string
  config?: Record<string, any>
  subscriptions?: AlertChannelSubscription[]
  sendRecovery?: boolean
  sendFailure?: boolean
  sendDegraded?: boolean
  sslExpiry?: boolean
  sslExpiryThreshold?: number
  autoSubscribe?: boolean
  created_at?: string
  updated_at?: string | null
  createdAt?: string
  updatedAt?: string | null
}

export interface AlertChannelListParams {
  limit?: number
  page?: number
}

export interface PaginatedAlertChannels {
  alertChannels: AlertChannel[]
  total: number
  page: number
  limit: number
}

class AlertChannels {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async getAllPaginated (params: AlertChannelListParams = {}): Promise<PaginatedAlertChannels> {
    const response = await this.api.get<AlertChannel[]>('/v1/alert-channels', { params })
    const total = parseTotalFromContentRange(response.headers['content-range']) ?? response.data.length
    return {
      alertChannels: response.data,
      total,
      page: params.page ?? 1,
      limit: params.limit ?? 10,
    }
  }

  async get (id: number): Promise<AlertChannel> {
    const response = await this.api.get<AlertChannel>(`/v1/alert-channels/${id}`)
    return response.data
  }
}

export default AlertChannels
