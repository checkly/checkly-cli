import type { AxiosInstance } from 'axios'
import { GitInformation } from '../services/util'
import { RetryStrategy, SharedFile } from '../constructs'
import { compressJSONPayload } from './util'

type RunTestSessionRequest = {
  name: string,
  checkRunJobs: any[],
  project: { logicalId: string },
  sharedFiles?: SharedFile[]
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

class TestSessions {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  run (payload: RunTestSessionRequest) {
    return this.api.post('/next/test-sessions/run', payload, {
      transformRequest: compressJSONPayload,
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
