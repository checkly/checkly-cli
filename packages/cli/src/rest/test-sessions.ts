import { type AxiosInstance } from 'axios'
import { GitInformation } from '../services/util.js'
import { RetryStrategy, SharedFile } from '../constructs/index.js'
import { compressJSONPayload } from './util.js'
import { SequenceId } from '../services/abstract-check-runner.js'
import { ForbiddenError, RequestTimeoutError } from './errors.js'
import type { CheckResult } from './check-results.js'

const COMPLETION_MAX_WAIT_SECONDS = 30

type RunTestSessionRequest = {
  name: string
  checkRunJobs: any[]
  project: { logicalId: string }
  sharedFiles?: SharedFile[]
  runLocation: string | { type: 'PUBLIC', region: string } | { type: 'PRIVATE', slugName: string, id: string }
  repoInfo?: GitInformation | null
  environment?: string | null
  shouldRecord: boolean
  streamLogs?: boolean
  refreshCache?: boolean
}

type TriggerTestSessionRequest = {
  name: string
  runLocation: string | { type: 'PUBLIC', region: string } | { type: 'PRIVATE', slugName: string, id: string }
  shouldRecord: boolean
  targetTags: string[][]
  checkId?: string[]
  checkRunSuiteId: string
  environmentVariables: Array<{ key: string, value: string }>
  repoInfo: GitInformation | null
  environment: string | null
  testRetryStrategy: RetryStrategy | null
  refreshCache?: boolean
}

export type TestResultsShortLinks = {
  testResultLink: string
  testTraceLinks: string[]
  videoLinks: string[]
  screenshotLinks: string[]
}

export type TriggerTestSessionResponse = {
  checks: Array<any>
  testSessionId: string
  testResultIds: Record<string, string>
  sequenceIds: Record<string, SequenceId>
}

export type RunTestSessionResponse = {
  /** The scheduling operation dispatching this run's check runs in the background. */
  schedulingId: string
  /** Only present for recorded runs (shouldRecord: true). */
  testSessionId?: string
  testResultIds?: Record<string, string>
  sequenceIds: Record<string, SequenceId>
}

export type TestSessionSchedulingStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export type TestSessionSchedulingOperation = {
  schedulingId: string
  testSessionId: string | null
  status: TestSessionSchedulingStatus
  checksTotal: number
  error: { code: string, message: string } | null
  createdAt: string
  startedAt: string | null
  endedAt: string | null
}

/**
 * The background dispatch of the test session's check runs failed (or the
 * worker died — errorCode ABANDONED): no results will arrive for the
 * undispatched checks, so the run should fail immediately instead of waiting
 * out the per-check result timeouts.
 */
export class TestSessionSchedulingFailedError extends Error {
  /** The operation's error code (e.g. SCHEDULING_ERROR, ABANDONED), when known. */
  code?: string

  constructor (message: string, options?: ErrorOptions & { code?: string }) {
    super(message, options)
    this.name = 'TestSessionSchedulingFailedError'
    this.code = options?.code
  }
}

export type TestSessionMetadata = {
  environment?: string
  repoUrl?: string
  commitId?: string
  commitOwner?: string
  commitMessage?: string
  branchName?: string
  github?: GitInformation['github']
}

export type TestSessionStatus = 'RUNNING' | 'FAILED' | 'PASSED' | 'CANCELLED'

export type TestSessionProvider = 'GITHUB' | 'VERCEL' | 'API' | 'TRIGGER' | 'PW_REPORTER'

export type TestSessionResult = {
  testSessionResultId: string
  testSessionResultLink: string
  checkId?: string | null
  checkType: string
  name?: string
  runLocation?: string
  resultType?: string
  status: TestSessionStatus
  hasErrors: boolean
  hasFailures: boolean
  isDegraded: boolean
  aborted: boolean
  errorGroupIds?: string[]
}

export type TestSessionDetail = {
  testSessionId: string
  testSessionLink: string
  name: string
  status: TestSessionStatus
  startedAt: string
  stoppedAt: string | null
  timeElapsed: number
  metadata?: TestSessionMetadata
  errorGroupIds?: string[]
  results?: TestSessionResult[]
}

type TestSessionListEntryInvoker = {
  name: string
  picture?: string | null
} | null

export type TestSessionListEntry = {
  id: string
  accountId: string
  projectId?: string | null
  name: string
  provider: string
  running?: string[] | null
  passed?: string[] | null
  failed?: string[] | null
  cancelled?: string[] | null
  status?: TestSessionStatus
  region: string
  privateLocationId?: string | null
  invoker?: TestSessionListEntryInvoker
  repoUrl?: string | null
  commitId?: string | null
  commitOwner?: string | null
  commitMessage?: string | null
  branchName?: string | null
  environment?: string | null
  startedAt: string
  stoppedAt?: string | null
  created_at: string
  updated_at?: string | null
}

export type ListTestSessionsParams = {
  from?: number
  to?: number
  limit?: number
  statuses?: TestSessionStatus[]
  branches?: string[]
  users?: string[]
  providers?: TestSessionProvider[]
  noUsers?: boolean
  nextId?: string
  textSearch?: string
  errorGroupId?: string
}

export type TestSessionsListResponse = {
  length: number
  entries: TestSessionListEntry[]
  nextId?: string | null
}

export class NoMatchingChecksError extends Error {
  constructor (options?: ErrorOptions) {
    super(`No matching checks found.`, options)
    this.name = 'NoMatchingChecksError'
  }
}

class TestSessions {
  api: AxiosInstance
  constructor (api: AxiosInstance) {
    this.api = api
  }

  async run (payload: RunTestSessionRequest) {
    return await this.api.post<RunTestSessionResponse>('/v1/test-sessions/run', payload, {
      transformRequest: compressJSONPayload,
    })
  }

  /**
   * Long-poll the dispatch status of an asynchronously started test-session
   * run. The server blocks for up to `maxWaitSeconds` and returns the
   * operation once it reaches a terminal state, or responds 408
   * ({@link RequestTimeoutError}) while dispatch is still in progress — the
   * retry cadence lives in the caller.
   */
  getSchedulingCompletion (schedulingId: string, options?: { maxWaitSeconds?: number, signal?: AbortSignal }) {
    return this.api.get<TestSessionSchedulingOperation>(`/v1/test-sessions/scheduling/${schedulingId}/completion`, {
      params: { maxWaitSeconds: options?.maxWaitSeconds ?? COMPLETION_MAX_WAIT_SECONDS },
      signal: options?.signal,
    })
  }

  async pollSchedulingUntilComplete (
    schedulingId: string,
    options?: { signal?: AbortSignal },
  ): Promise<TestSessionSchedulingOperation> {
    while (true) {
      try {
        const { data } = await this.getSchedulingCompletion(schedulingId, options)
        return data
      } catch (err) {
        if (err instanceof RequestTimeoutError && !options?.signal?.aborted) {
          continue
        }
        throw err
      }
    }
  }

  /**
   * @throws {NoMatchingChecksError} If no checks matched the request.
   */
  async trigger (payload: TriggerTestSessionRequest) {
    try {
      const resp = await this.api.post<TriggerTestSessionResponse>('/next/test-sessions/trigger', payload)

      if (resp.data.checks.length === 0) {
        // Currently the BE will never return an empty `checks` array, it returns a 403 instead.
        // This is added to make the old CLI versions compatible if we ever change this, though.
        throw new NoMatchingChecksError()
      }

      return resp
    } catch (err) {
      if (err instanceof ForbiddenError && err.data.errorCode === 'ERR_NO_MATCHING_CHECKS') {
        throw new NoMatchingChecksError()
      }

      throw err
    }
  }

  get (id: string) {
    return this.api.get<TestSessionDetail>(`/v1/test-sessions/${id}`)
  }

  getResult (id: string, resultId: string) {
    return this.api.get<CheckResult>(`/v1/test-sessions/${id}/results/${resultId}`)
  }

  getCompletion (id: string, maxWaitSeconds = COMPLETION_MAX_WAIT_SECONDS) {
    return this.api.get<TestSessionDetail>(`/v1/test-sessions/${id}/completion`, {
      params: { maxWaitSeconds },
    })
  }

  async pollUntilComplete (id: string): Promise<TestSessionDetail> {
    while (true) {
      try {
        const { data } = await this.getCompletion(id)
        return data
      } catch (err) {
        if (err instanceof RequestTimeoutError) {
          continue
        }
        throw err
      }
    }
  }

  list (params: ListTestSessionsParams = {}) {
    return this.api.get<TestSessionsListResponse>('/v1/test-sessions', { params })
  }

  getShortLink (id: string) {
    return this.api.get<{ link: string }>(`/next/test-sessions/${id}/link`)
  }

  getResultShortLinks (testSessionId: string, testResultId: string) {
    return this.api.get<TestResultsShortLinks>(`/next/test-sessions/${testSessionId}/results/${testResultId}/links`)
  }
}

export default TestSessions
