import type { AxiosInstance } from 'axios'

type RunTestSessionRequest = {
  checkRunJobs: any[],
  project: { logicalId: string },
  runLocation: string|{ type: 'PUBLIC', region: string }|{ type: 'PRIVATE', slugName: string, id: string },
  shouldRecord: boolean,
}

class TestSessions {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  run (payload: RunTestSessionRequest) {
    return this.api.post('/next/test-sessions/run', payload)
  }
}

export default TestSessions
