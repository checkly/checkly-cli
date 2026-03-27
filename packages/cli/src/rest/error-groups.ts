import type { AxiosInstance } from 'axios'

export interface RcaEvidence {
  artifacts: Array<{ name: string, type: string }>
  description: string
}

export interface RcaReferenceLink {
  url: string
  title: string
}

export interface RootCauseAnalysis {
  id: string
  created_at: string
  analysis: {
    classification: string
    rootCause: string
    userImpact: string
    codeFix: string | null
    evidence: RcaEvidence[] | null
    referenceLinks: RcaReferenceLink[] | null
  }
  provider: string
  model: string
  durationMs: number
  userContext: Array<{ text: string, type: string }> | null
}

export interface ErrorGroup {
  id: string
  checkId: string
  errorHash: string
  rawErrorMessage: string | null
  cleanedErrorMessage: string
  firstSeen: string
  lastSeen: string
  archivedUntilNextEvent: boolean
  rootCauseAnalyses?: RootCauseAnalysis[]
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
