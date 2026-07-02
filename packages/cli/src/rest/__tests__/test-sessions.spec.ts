import { describe, expect, it, vi } from 'vitest'
import TestSessions from '../test-sessions.js'
import { RequestTimeoutError } from '../errors.js'

describe('TestSessions REST client', () => {
  const githubRepoInfo = {
    commitId: 'abc123',
    github: {
      reporting: true,
      repository: 'checkly/playwright-reporter-demo',
      sha: 'abc123',
      runId: '123456',
      runAttempt: '2',
      workflow: 'Checkly',
      job: 'validate',
      eventName: 'pull_request',
      ref: 'refs/pull/4/merge',
      headRef: 'herve/test-checkly-action',
      baseRef: 'main',
      serverUrl: 'https://github.com',
    },
  }

  it('passes GitHub metadata to detached test session runs', async () => {
    const api = {
      post: vi.fn().mockResolvedValue({ data: { testSessionId: 'session-id', sequenceIds: {} } }),
    }
    const testSessions = new TestSessions(api as any)

    await testSessions.run({
      name: 'Checkly',
      checkRunJobs: [],
      project: { logicalId: 'project' },
      runLocation: 'us-east-1',
      repoInfo: githubRepoInfo,
      environment: null,
      shouldRecord: true,
    } as any)

    expect(api.post).toHaveBeenCalledWith('/next/test-sessions/run', expect.objectContaining({
      repoInfo: githubRepoInfo,
    }), expect.any(Object))
  })

  it('passes GitHub metadata to detached trigger sessions', async () => {
    const api = {
      post: vi.fn().mockResolvedValue({ data: { checks: [{ id: 'check-id' }], testSessionId: 'session-id', sequenceIds: {} } }),
    }
    const testSessions = new TestSessions(api as any)

    await testSessions.trigger({
      name: 'Checkly',
      runLocation: 'us-east-1',
      shouldRecord: true,
      targetTags: [['production']],
      checkRunSuiteId: 'suite-id',
      environmentVariables: [],
      repoInfo: githubRepoInfo,
      environment: null,
      testRetryStrategy: null,
    } as any)

    expect(api.post).toHaveBeenCalledWith('/next/test-sessions/trigger', expect.objectContaining({
      repoInfo: githubRepoInfo,
    }))
  })

  it('gets a public test session by ID', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ data: { testSessionId: 'session-id', results: [] } }),
    }
    const testSessions = new TestSessions(api as any)

    await testSessions.get('session-id')

    expect(api.get).toHaveBeenCalledWith('/v1/test-sessions/session-id')
  })

  it('gets a public test session result by ID', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ data: { id: 'result-id' } }),
    }
    const testSessions = new TestSessions(api as any)

    await testSessions.getResult('session-id', 'result-id')

    expect(api.get).toHaveBeenCalledWith('/v1/test-sessions/session-id/results/result-id')
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

  it('lists public test sessions with filters', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ data: { length: 0, entries: [], nextId: null } }),
    }
    const testSessions = new TestSessions(api as any)

    await testSessions.list({
      limit: 10,
      statuses: ['FAILED'],
      branches: ['main'],
      users: ['Herve'],
      providers: ['API'],
      noUsers: true,
      nextId: 'cursor',
      textSearch: 'smoke',
      errorGroupId: 'error-group-id',
    })

    expect(api.get).toHaveBeenCalledWith('/v1/test-sessions', {
      params: {
        limit: 10,
        statuses: ['FAILED'],
        branches: ['main'],
        users: ['Herve'],
        providers: ['API'],
        noUsers: true,
        nextId: 'cursor',
        textSearch: 'smoke',
        errorGroupId: 'error-group-id',
      },
    })
  })
})
