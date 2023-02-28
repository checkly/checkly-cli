import type { AxiosInstance } from 'axios'

class TestSessions {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  run (checkRunJobs: any, project: { logicalId: string }) {
    return this.api.post(
      '/next/test-sessions/run',
      { checkRunJobs, project },
    )
  }
}

export default TestSessions
