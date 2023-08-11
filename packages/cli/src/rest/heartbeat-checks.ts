import type { AxiosInstance } from 'axios'

export interface HeartbeatCheck {
  pingUrl: string
  name: string
}

class HeartbeatChecks {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  get (id: string) {
    return this.api.get<HeartbeatCheck>(`/v1/checks/${id}`, {
      transformResponse: (data: any) => {
        const { heartbeat: { pingUrl }, name } = JSON.parse(data)
        return { pingUrl, name }
      },
    })
  }
}

export default HeartbeatChecks
