import type { AxiosInstance } from 'axios'

import { NotFoundError, RequestTimeoutError } from './errors.js'

const COMPLETION_MAX_WAIT_SECONDS = 30

export type CheckSessionStatus =
  | 'STARTED'
  | 'PROGRESS'
  | 'FAILED'
  | 'PASSED'
  | 'DEGRADED'
  | 'PROGRESS_FAILED'
  | 'PROGRESS_DEGRADED'
  | 'TIMED_OUT'
  | 'CANCELLED'

export type FinalCheckSessionStatus = 'PASSED' | 'FAILED' | 'DEGRADED' | 'TIMED_OUT' | 'CANCELLED'

export interface CheckSessionResult {
  checkResultId: string
  checkResultLink: string
  checkId: string
  checkType: string
  name: string
  runLocation: string
  resultType: 'FINAL' | 'ATTEMPT' | null
  hasErrors: boolean
  hasFailures: boolean
  isDegraded: boolean
  aborted: boolean
  isCancelled: boolean
  responseTime?: number | null
  startedAt?: string | null
  stoppedAt?: string | null
}

export interface CheckSession {
  checkSessionId: string
  checkSessionLink: string
  checkId: string
  checkType: string
  name?: string
  status: CheckSessionStatus
  startedAt: string
  stoppedAt: string | null
  timeElapsed: number
  runLocations: string[]
  runSource: string | null
}

export interface CompletedCheckSession extends CheckSession {
  status: FinalCheckSessionStatus
  stoppedAt: string
  results: CheckSessionResult[]
}

export interface TriggerCheckSessionsRequest {
  target?: {
    matchTags?: string[][]
    checkId?: string[]
  }
  refreshCache?: boolean
}

export interface TriggerCheckSessionsResponse {
  sessions: CheckSession[]
}

export class NoMatchingChecksError extends Error {
  constructor (options?: ErrorOptions) {
    super('No matching checks found.', options)
    this.name = 'NoMatchingChecksError'
  }
}

export class CheckSessionWaitTimeoutError extends Error {
  checkSessionId: string

  constructor (checkSessionId: string) {
    super(`Timed out waiting for check session ${checkSessionId} to complete.`)
    this.name = 'CheckSessionWaitTimeoutError'
    this.checkSessionId = checkSessionId
  }
}

class CheckSessions {
  api: AxiosInstance

  constructor (api: AxiosInstance) {
    this.api = api
  }

  async trigger (payload: TriggerCheckSessionsRequest): Promise<TriggerCheckSessionsResponse> {
    try {
      const response = await this.api.post<TriggerCheckSessionsResponse>('/v2/check-sessions/trigger', payload)
      return response.data
    } catch (err) {
      // The trigger endpoint has no path resource that can be missing. Its 404
      // response specifically means that no activated, runnable checks matched.
      if (err instanceof NotFoundError) {
        throw new NoMatchingChecksError({ cause: err })
      }
      throw err
    }
  }

  async getCompletion (id: string, maxWaitSeconds = COMPLETION_MAX_WAIT_SECONDS): Promise<CompletedCheckSession> {
    const response = await this.api.get<CompletedCheckSession>(`/v2/check-sessions/${id}/completion`, {
      params: { maxWaitSeconds },
    })
    return response.data
  }

  async pollUntilComplete (id: string, deadlineAt?: number): Promise<CompletedCheckSession> {
    while (true) {
      const remainingMs = deadlineAt === undefined ? Number.POSITIVE_INFINITY : deadlineAt - Date.now()
      if (remainingMs <= 0) {
        throw new CheckSessionWaitTimeoutError(id)
      }

      const maxWaitSeconds = Number.isFinite(remainingMs)
        ? Math.min(COMPLETION_MAX_WAIT_SECONDS, Math.max(1, Math.floor(remainingMs / 1_000)))
        : COMPLETION_MAX_WAIT_SECONDS

      try {
        return await this.getCompletion(id, maxWaitSeconds)
      } catch (err) {
        // The completion endpoint long-polls. A 408 means the session is still
        // running, so start another bounded long-poll until the overall deadline.
        if (err instanceof RequestTimeoutError) {
          continue
        }
        throw err
      }
    }
  }
}

export default CheckSessions
