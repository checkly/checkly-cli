import { type AxiosInstance } from 'axios'

type CancelCheckSessionRequest = {
  checkSessionId: string
}
type CancelTestSessionRequest = {
  testSessionId: string
}

class Cancel {
  api: AxiosInstance

  constructor (api: AxiosInstance) {
    this.api = api
  }

  async cancelTestSession (payload: CancelTestSessionRequest) {
    return await this.api.post('/v1/cancel', payload)
  }

  async cancelCheckSession (payload: CancelCheckSessionRequest) {
    return await this.api.post('/v1/cancel', payload)
  }
}

export default Cancel
