import type { AxiosInstance } from 'axios'
import type { RootCauseAnalysis } from './error-groups'

export interface TriggerRcaResponse {
  id: string
}

class Rca {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  trigger (errorGroupId: string) {
    return this.api.post<TriggerRcaResponse>(
      `/v1/root-cause-analyses/error-groups/${errorGroupId}`,
    )
  }

  get (id: string) {
    return this.api.get<RootCauseAnalysis>(`/v1/root-cause-analyses/${id}`)
  }
}

export default Rca
