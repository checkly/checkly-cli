import type { AxiosInstance } from 'axios'
import { parseTotalFromContentRange } from '../helpers/content-range.js'

export interface AlertNotification {
  id: string
  type: string
  status: 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE' | 'RATE_LIMITED' | string
  alertConfig?: Record<string, any>
  notificationResult?: string | null
  timestamp?: string | null
  checkType?: string
  checkId?: string
  checkName?: string
  check?: {
    id?: string
    name?: string
  }
  checkAlertId?: string
  alertChannelId: number
  checkResultId?: string
}

export interface AlertNotificationListParams {
  limit?: number
  page?: number
  from?: number
  to?: number
  alertChannelId?: number
  hasFailures?: boolean
}

export interface PaginatedAlertNotifications {
  data: AlertNotification[]
  total: number
  page: number
  limit: number
}

class AlertNotifications {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async getAll (params: AlertNotificationListParams = {}): Promise<PaginatedAlertNotifications> {
    const response = await this.api.get<AlertNotification[]>('/v1/alert-notifications', { params })
    const total = parseTotalFromContentRange(response.headers['content-range']) ?? response.data.length
    return {
      data: response.data,
      total,
      page: params.page ?? 1,
      limit: params.limit ?? 10,
    }
  }
}

export default AlertNotifications
