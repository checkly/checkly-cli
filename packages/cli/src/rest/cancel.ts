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
    try {
      return await this.api.post('/v1/cancel', payload)
    } catch (err: any) {
      if (err?.response?.status === 403) return
      throw err
    }
  }

  async cancelCheckSession (payload: CancelCheckSessionRequest) {
    try {
      return await this.api.post('/v1/cancel', payload)
    } catch (err: any) {
      if (err?.response?.status === 403) return
      throw err
    }
  }
}

export default Cancel
