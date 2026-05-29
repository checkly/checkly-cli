import { describe, expect, it, vi } from 'vitest'
import TestSessions from '../test-sessions.js'

describe('TestSessions REST client', () => {
  it('gets a public test session by ID', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ data: { testSessionId: 'session-id', results: [] } }),
    }
    const testSessions = new TestSessions(api as any)

    await testSessions.get('session-id')

    expect(api.get).toHaveBeenCalledWith('/v1/test-sessions/session-id')
  })
})
