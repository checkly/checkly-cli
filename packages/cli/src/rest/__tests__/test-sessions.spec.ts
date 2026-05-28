import { describe, expect, it, vi } from 'vitest'
import TestSessions from '../test-sessions.js'
import { RequestTimeoutError } from '../errors.js'

describe('TestSessions REST client', () => {
  it('gets a public test session by ID', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ data: { testSessionId: 'session-id', results: [] } }),
    }
    const testSessions = new TestSessions(api as any)

    await testSessions.get('session-id')

    expect(api.get).toHaveBeenCalledWith('/v1/test-sessions/session-id')
  })

  it('gets public test session completion by ID', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ data: { testSessionId: 'session-id', status: 'PASSED', results: [] } }),
    }
    const testSessions = new TestSessions(api as any)

    await testSessions.getCompletion('session-id')

    expect(api.get).toHaveBeenCalledWith('/v1/test-sessions/session-id/completion', {
      params: { maxWaitSeconds: 30 },
    })
  })

  it('polls public test session completion timeouts until complete', async () => {
    const completed = { testSessionId: 'session-id', status: 'PASSED', results: [] }
    const api = {
      get: vi.fn()
        .mockRejectedValueOnce(new RequestTimeoutError({
          statusCode: 408,
          error: 'Request Timeout',
          message: 'Test session is still in progress, but maximum per-request wait time was exceeded. Please retry.',
        }))
        .mockResolvedValueOnce({ data: completed }),
    }
    const testSessions = new TestSessions(api as any)

    const result = await testSessions.pollUntilComplete('session-id')

    expect(result).toEqual(completed)
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenCalledWith('/v1/test-sessions/session-id/completion', {
      params: { maxWaitSeconds: 30 },
    })
  })
})
