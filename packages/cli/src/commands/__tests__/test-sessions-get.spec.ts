import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestSessionErrorGroup } from '../../rest/test-session-error-groups.js'
import type { TestSessionDetail } from '../../rest/test-sessions.js'

vi.mock('../../rest/api.js', () => ({
  testSessions: { get: vi.fn(), pollUntilComplete: vi.fn() },
  testSessionErrorGroups: { get: vi.fn() },
}))

import * as api from '../../rest/api.js'
import TestSessionsGet from '../test-sessions/get.js'

const testSession: TestSessionDetail = {
  testSessionId: '8166fa86-c9b4-4162-8541-d380c6c212d8',
  testSessionLink: 'https://app.checklyhq.com/accounts/account-id/test-sessions/8166fa86-c9b4-4162-8541-d380c6c212d8',
  name: 'Production smoke test',
  status: 'FAILED',
  startedAt: '2026-05-20T08:00:00.000Z',
  stoppedAt: '2026-05-20T08:02:03.456Z',
  timeElapsed: 123456,
  metadata: { environment: 'production' },
  errorGroupIds: ['session-eg-1'],
  results: [
    {
      testSessionResultId: '42406a0f-5864-4a26-9884-7c5d1be15bc2',
      testSessionResultLink: 'https://app.checklyhq.com/accounts/account-id/test-sessions/session-id/results/result-id',
      checkId: null,
      checkType: 'API',
      name: 'API smoke',
      runLocation: 'eu-west-1',
      resultType: 'FINAL',
      status: 'FAILED',
      hasErrors: false,
      hasFailures: true,
      isDegraded: false,
      aborted: false,
      errorGroupIds: ['result-eg-1'],
    },
  ],
}

const testSessionErrorGroup: TestSessionErrorGroup = {
  id: 'result-eg-1',
  projectId: 'project-1',
  environments: ['production'],
  errorHash: 'hash-1',
  rawErrorMessage: 'Error: boom',
  cleanedErrorMessage: 'Error: boom',
  firstSeen: '2026-05-20T08:00:00.000Z',
  lastSeen: '2026-05-20T08:02:03.456Z',
  archivedUntilNextEvent: false,
}

function createCommandContext (parsed: unknown) {
  const logged: string[] = []
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    style: {
      outputFormat: undefined,
      longError: vi.fn(),
      actionStart: vi.fn(),
      actionSuccess: vi.fn(),
      actionFailure: vi.fn(),
    },
    logged,
  }
}

describe('test-sessions get command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(api.testSessions.get).mockResolvedValue({ data: testSession } as any)
    vi.mocked(api.testSessions.pollUntilComplete).mockResolvedValue(testSession as any)
    vi.mocked(api.testSessionErrorGroups.get).mockResolvedValue({ data: testSessionErrorGroup } as any)
  })

  it('fetches and renders test session detail output', async () => {
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { output: 'detail' },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(api.testSessions.get).toHaveBeenCalledWith(testSession.testSessionId)
    expect(ctx.logged[0]).toContain('Production smoke test')
    expect(ctx.logged[0]).toContain('API smoke')
    expect(ctx.logged[0]).toContain('ERROR GROUP IDS')
    expect(ctx.logged[0]).toContain('session-eg-1')
    expect(ctx.logged[0]).toContain('checkly rca run --test-session-error-group <error-group-id> --watch')
    expect(ctx.logged[0]).toContain(testSession.testSessionLink)
  })

  it('watches completion before rendering detail output', async () => {
    const completed = { ...testSession, status: 'PASSED' as const }
    vi.mocked(api.testSessions.pollUntilComplete).mockResolvedValue(completed as any)
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { output: 'detail', watch: true },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(api.testSessions.get).not.toHaveBeenCalled()
    expect(api.testSessions.pollUntilComplete).toHaveBeenCalledWith(testSession.testSessionId)
    expect(ctx.style.actionStart).toHaveBeenCalledWith('Watching test session until completion...')
    expect(ctx.style.actionSuccess).toHaveBeenCalled()
    expect(ctx.logged[0]).toContain('Production smoke test')
    expect(ctx.logged[0]).toContain('passed')
  })

  it('watches completion before returning raw json output', async () => {
    const completed = { ...testSession, status: 'PASSED' as const }
    vi.mocked(api.testSessions.pollUntilComplete).mockResolvedValue(completed as any)
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { output: 'json', watch: true },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(api.testSessions.get).not.toHaveBeenCalled()
    expect(JSON.parse(ctx.logged[0])).toEqual(completed)
    expect(ctx.style.actionStart).not.toHaveBeenCalled()
  })

  it('fetches and renders one test session error group detail', async () => {
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { 'output': 'detail', 'error-group': 'result-eg-1', 'full-error': false },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(api.testSessions.get).toHaveBeenCalledWith(testSession.testSessionId)
    expect(api.testSessionErrorGroups.get).toHaveBeenCalledWith('result-eg-1')
    expect(ctx.logged[0]).toContain('Test session error group')
    expect(ctx.logged[0]).toContain('Error: boom')
  })

  it('watches completion before checking a test session error group', async () => {
    vi.mocked(api.testSessions.pollUntilComplete).mockResolvedValue({
      ...testSession,
      errorGroupIds: [],
      results: [{ ...testSession.results[0], errorGroupIds: ['result-eg-1'] }],
    } as any)
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { 'error-group': 'result-eg-1', 'full-error': false, 'output': 'detail', 'watch': true },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(api.testSessions.get).not.toHaveBeenCalled()
    expect(api.testSessions.pollUntilComplete).toHaveBeenCalledWith(testSession.testSessionId)
    expect(api.testSessionErrorGroups.get).toHaveBeenCalledWith('result-eg-1')
    expect(ctx.logged[0]).toContain('Test session error group')
  })

  it('limits long test session error group detail output by default', async () => {
    vi.mocked(api.testSessionErrorGroups.get).mockResolvedValue({
      data: {
        ...testSessionErrorGroup,
        rawErrorMessage: Array.from({ length: 81 }, (_, i) => `line ${i + 1}`).join('\n'),
      },
    } as any)
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { 'output': 'detail', 'error-group': 'result-eg-1', 'full-error': false },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('line 80')
    expect(ctx.logged[0]).not.toContain('line 81')
    expect(ctx.logged[0]).toContain('Showing first 80 of 81 lines. Use --full-error to print the complete raw error.')
  })

  it('renders full test session error group detail output when requested', async () => {
    vi.mocked(api.testSessionErrorGroups.get).mockResolvedValue({
      data: {
        ...testSessionErrorGroup,
        rawErrorMessage: Array.from({ length: 81 }, (_, i) => `line ${i + 1}`).join('\n'),
      },
    } as any)
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { 'output': 'detail', 'error-group': 'result-eg-1', 'full-error': true },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('line 80')
    expect(ctx.logged[0]).toContain('line 81')
    expect(ctx.logged[0]).not.toContain('Use --full-error')
  })

  it('returns raw test session error group response for json drilldown output', async () => {
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { 'output': 'json', 'error-group': 'result-eg-1' },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(JSON.parse(ctx.logged[0])).toEqual(testSessionErrorGroup)
  })

  it('rejects error group IDs that are not in the test session', async () => {
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { 'output': 'detail', 'error-group': 'other-eg' },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(api.testSessionErrorGroups.get).not.toHaveBeenCalled()
    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Test session error group not found in this session.',
      expect.stringContaining('--error-groups-limit 5'),
    )
    expect(process.exitCode).toBe(1)
  })

  it('deduplicates error group IDs when suggesting the list limit', async () => {
    vi.mocked(api.testSessions.get).mockResolvedValue({
      data: {
        ...testSession,
        errorGroupIds: ['eg-1', 'eg-2', 'eg-3', 'eg-1'],
        results: [{
          ...testSession.results[0],
          errorGroupIds: ['eg-1', 'eg-2', 'eg-3'],
        }],
      },
    } as any)
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { 'output': 'detail', 'error-group': 'other-eg' },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Test session error group not found in this session.',
      expect.stringContaining('--error-groups-limit 5'),
    )
  })

  it('returns raw API response for json output', async () => {
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { output: 'json' },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(JSON.parse(ctx.logged[0])).toEqual(testSession)
  })

  it('renders markdown output', async () => {
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { output: 'md' },
    })

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('# Production smoke test')
    expect(ctx.logged[0]).toContain('## Results')
    expect(ctx.logged[0]).toContain('## Hints')
  })

  it('reports API failures without throwing', async () => {
    const ctx = createCommandContext({
      args: { id: testSession.testSessionId },
      flags: { output: 'detail' },
    })
    vi.mocked(api.testSessions.get).mockRejectedValue(new Error('boom'))

    await TestSessionsGet.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to get test session details.', expect.any(Error))
    expect(process.exitCode).toBe(1)
  })
})
