import type { AxiosInstance, AxiosProgressEvent } from 'axios'
import { GitInformation } from '../services/util'
import { RetryStrategy } from '../constructs'

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
  testRetryStrategy: RetryStrategy | null,
}

export type TestResultsShortLinks = {
  testResultLink: string
  testTraceLinks: string[]
  videoLinks: string[]
  screenshotLinks: string[]
}

export type RunOptions = {
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
}

class TestSessions {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  run (payload: RunTestSessionRequest, options?: RunOptions) {
    return this.api.post('/next/test-sessions/run', payload, {
      onUploadProgress: options?.onUploadProgress,
    })
  }

  trigger (payload: TriggerTestSessionRequest) {
    return this.api.post('/next/test-sessions/trigger', payload)
  }

  getShortLink (id: string) {
    return this.api.get<{ link: string }>(`/next/test-sessions/${id}/link`)
  }

  getResultShortLinks (testSessionId: string, testResultId: string) {
    return this.api.get<TestResultsShortLinks>(`/next/test-sessions/${testSessionId}/results/${testResultId}/links`)
  }
}

export default TestSessions
