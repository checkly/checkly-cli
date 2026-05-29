import type { AxiosInstance } from 'axios'
import type { RootCauseAnalysis } from './error-groups.js'

export interface TriggerRcaResponse {
  id: string
}

const POLL_INTERVAL_MS = 2000

class Rca {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  trigger (errorGroupId: string, userContext?: string) {
    return this.api.post<TriggerRcaResponse>(
      `/v1/root-cause-analyses/error-groups/${errorGroupId}`,
      userContext ? { userContext } : undefined,
    )
  }

  triggerTestSessionErrorGroup (testSessionErrorGroupId: string, userContext?: string) {
    return this.api.post<TriggerRcaResponse>(
      `/v1/root-cause-analyses/test-session-error-groups/${testSessionErrorGroupId}`,
      userContext ? { userContext } : undefined,
    )
  }

  get (id: string) {
    return this.api.get<RootCauseAnalysis>(`/v1/root-cause-analyses/${id}`)
  }

  async pollUntilComplete (id: string): Promise<RootCauseAnalysis> {
    while (true) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      const response = await this.get(id)
      if (response.status === 202) {
        continue
      }
      return response.data
    }
  }
}

export default Rca
