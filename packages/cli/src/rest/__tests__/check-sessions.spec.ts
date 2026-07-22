import { afterEach, describe, expect, it, vi } from 'vitest'

import CheckSessions, {
  CheckSessionWaitTimeoutError,
  NoMatchingChecksError,
} from '../check-sessions.js'
import { NotFoundError, RequestTimeoutError } from '../errors.js'

const completedSession = {
  checkSessionId: '8166fa86-c9b4-4162-8541-d380c6c212d8',
  checkSessionLink: 'https://app.checklyhq.com/check-sessions/session-id',
  checkId: 'a4cd4ad9-4815-4a9e-92d2-0a7c562ee69a',
  checkType: 'API',
  name: 'Production API',
  status: 'PASSED',
  startedAt: '2026-07-21T12:00:00.000Z',
  stoppedAt: '2026-07-21T12:00:01.000Z',
  timeElapsed: 1_000,
  runLocations: ['us-east-1'],
  runSource: 'TRIGGER_API',
  results: [],
} as const

describe('CheckSessions REST client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('triggers v2 check sessions with the provided target', async () => {
    const response = { sessions: [{ ...completedSession, status: 'PROGRESS', stoppedAt: null }] }
    const api = { post: vi.fn().mockResolvedValue({ data: response }) }
    const checkSessions = new CheckSessions(api as any)
    const payload = {
      target: {
        matchTags: [['production', 'api'], ['critical']],
        checkId: ['a4cd4ad9-4815-4a9e-92d2-0a7c562ee69a'],
      },
      refreshCache: true,
    }

    await expect(checkSessions.trigger(payload)).resolves.toEqual(response)
    expect(api.post).toHaveBeenCalledWith('/v2/check-sessions/trigger', payload)
  })

  it('maps a trigger 404 to no matching checks', async () => {
    const api = {
      post: vi.fn().mockRejectedValue(new NotFoundError({
        statusCode: 404,
        error: 'Not Found',
        message: 'No matching checks were found.',
      })),
    }
    const checkSessions = new CheckSessions(api as any)

    await expect(checkSessions.trigger({})).rejects.toBeInstanceOf(NoMatchingChecksError)
  })

  it('requests completion with the backend maximum long-poll duration', async () => {
    const api = { get: vi.fn().mockResolvedValue({ data: completedSession }) }
    const checkSessions = new CheckSessions(api as any)

    await expect(checkSessions.getCompletion(completedSession.checkSessionId)).resolves.toEqual(completedSession)
    expect(api.get).toHaveBeenCalledWith(
      `/v2/check-sessions/${completedSession.checkSessionId}/completion`,
      { params: { maxWaitSeconds: 30 } },
    )
  })

  it('repeats retryable completion long-polls until the session completes', async () => {
    const api = {
      get: vi.fn()
        .mockRejectedValueOnce(new RequestTimeoutError({
          statusCode: 408,
          error: 'Request Timeout',
          message: 'Check session is still in progress.',
        }))
        .mockResolvedValueOnce({ data: completedSession }),
    }
    const checkSessions = new CheckSessions(api as any)

    await expect(checkSessions.pollUntilComplete(completedSession.checkSessionId)).resolves.toEqual(completedSession)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('caps each long-poll to the remaining overall timeout', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const api = { get: vi.fn().mockResolvedValue({ data: completedSession }) }
    const checkSessions = new CheckSessions(api as any)

    await checkSessions.pollUntilComplete(completedSession.checkSessionId, 15_500)

    expect(api.get).toHaveBeenCalledWith(
      `/v2/check-sessions/${completedSession.checkSessionId}/completion`,
      { params: { maxWaitSeconds: 5 } },
    )
  })

  it('fails before another request once the overall timeout is exhausted', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const api = { get: vi.fn() }
    const checkSessions = new CheckSessions(api as any)

    await expect(checkSessions.pollUntilComplete(completedSession.checkSessionId, 10_000))
      .rejects
      .toBeInstanceOf(CheckSessionWaitTimeoutError)
    expect(api.get).not.toHaveBeenCalled()
  })
})
