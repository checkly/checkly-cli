import type { AxiosInstance } from 'axios'
import { GitInformation } from '../services/util'

type RunTestSessionRequest = {
  name: string,
  checkRunJobs: any[],
  project: { logicalId: string },
  runLocation: string|{ type: 'PUBLIC', region: string }|{ type: 'PRIVATE', slugName: string, id: string },
  repoInfo?: GitInformation | null,
  environment?: string | null,
  shouldRecord: boolean,
}

type TriggerTestSessionRequest = {
  name: string,
  runLocation: string|{ type: 'PUBLIC', region: string }|{ type: 'PRIVATE', slugName: string, id: string },
  shouldRecord: boolean,
  targetTags: string[][],
  checkRunSuiteId: string,
  environmentVariables: Array<{ key: string, value: string }>,
  repoInfo: GitInformation | null,
  environment: string | null,
}

class TestSessions {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  run (payload: RunTestSessionRequest) {
    return this.api.post('/next/test-sessions/run', payload)
  }

  trigger (payload: TriggerTestSessionRequest) {
    return this.api.post('/next/test-sessions/trigger', payload)
  }
}

export default TestSessions
