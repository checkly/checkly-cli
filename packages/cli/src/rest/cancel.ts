import { type AxiosInstance } from 'axios'

class Cancel {
  api: AxiosInstance

  constructor (api: AxiosInstance) {
    this.api = api
  }

  async cancelTestSession ({ testSessionId, sequenceId }: { testSessionId: string, sequenceId?: string[] }) {
    try {
      return await this.api.post(`/v1/test-sessions/${testSessionId}/cancel`, sequenceId ? { sequenceId } : undefined)
    } catch (err: any) {
      if (err?.response?.status === 403) return
      throw err
    }
  }

  async cancelCheckSession ({ checkSessionId, sequenceId }: { checkSessionId: string, sequenceId?: string[] }) {
    try {
      return await this.api.post(`/v1/check-sessions/${checkSessionId}/cancel`, sequenceId ? { sequenceId } : undefined)
    } catch (err: any) {
      if (err?.response?.status === 403) return
      throw err
    }
  }
}

export default Cancel
