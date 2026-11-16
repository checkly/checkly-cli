import { RestResource } from './rest-resource.js'

export interface TestSessionErrorGroup {
  id: string
  projectId: string
  environments: string[]
  errorHash: string
  rawErrorMessage: string | null
  cleanedErrorMessage: string
  firstSeen: string
  lastSeen: string
  archivedUntilNextEvent: boolean
}

class TestSessionErrorGroups extends RestResource {
  get (id: string) {
    return this.api.get<TestSessionErrorGroup>(`/v1/test-session-error-groups/${id}`)
  }
}

export default TestSessionErrorGroups
