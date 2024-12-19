import type { AxiosInstance } from 'axios'

interface Subscription {
  id: number;
  checkId: string;
  activated: boolean;
  groupId: string | null;
}

export interface AlertChannelApi {
  id: number;
  type: string;
  config: {
    number?: string;
    address?: string;
  };
  created_at: string;
  updated_at: string | null;
  sendRecovery: boolean;
  sendFailure: boolean;
  sendDegraded: boolean;
  sslExpiry: boolean;
  sslExpiryThreshold: number;
  autoSubscribe: boolean;
  subscriptions: Subscription[];
}

class AlertChannels {
  protected api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getAll () {
    return this.api.get<AlertChannelApi[]>('/v1/alert-channels')
  }
}

export default AlertChannels
