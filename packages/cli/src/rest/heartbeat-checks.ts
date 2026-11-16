import { RestResource } from './rest-resource.js'

export interface HeartbeatCheck {
  pingUrl: string
  name: string
}

class HeartbeatChecks extends RestResource {
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
