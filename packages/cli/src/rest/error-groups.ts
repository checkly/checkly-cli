import type { AxiosInstance } from 'axios'

export interface ErrorGroup {
  id: string
  checkId: string
  errorHash: string
  rawErrorMessage: string | null
  cleanedErrorMessage: string
  firstSeen: string
  lastSeen: string
  archivedUntilNextEvent: boolean
}

class ErrorGroups {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  getByCheckId (checkId: string) {
    return this.api.get<ErrorGroup[]>(`/v1/error-groups/checks/${checkId}`)
  }

  get (id: string) {
    return this.api.get<ErrorGroup>(`/v1/error-groups/${id}`)
  }
}

export default ErrorGroups
