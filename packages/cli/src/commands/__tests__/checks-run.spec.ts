import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CheckSession, CompletedCheckSession } from '../../rest/check-sessions.js'

vi.mock('../../rest/api.js', () => ({
  checkSessions: {
    trigger: vi.fn(),
    pollUntilComplete: vi.fn(),
  },
}))

import * as api from '../../rest/api.js'
import {
  CheckSessionWaitTimeoutError,
  NoMatchingChecksError,
} from '../../rest/check-sessions.js'
import ChecksRun from '../checks/run.js'

const pendingSessions: CheckSession[] = [
  {
    checkSessionId: '8166fa86-c9b4-4162-8541-d380c6c212d8',
    checkSessionLink: 'https://app.checklyhq.com/check-sessions/8166fa86-c9b4-4162-8541-d380c6c212d8',
    checkId: 'a4cd4ad9-4815-4a9e-92d2-0a7c562ee69a',
    checkType: 'API',
    name: 'Production API',
    status: 'PROGRESS',
    startedAt: '2026-07-21T12:00:00.000Z',
    stoppedAt: null,
    timeElapsed: 0,
    runLocations: ['us-east-1'],
    runSource: 'TRIGGER_API',
  },
  {
    checkSessionId: '16e22c0d-22a5-4d03-93c5-91bc38ac3c85',
    checkSessionLink: 'https://app.checklyhq.com/check-sessions/16e22c0d-22a5-4d03-93c5-91bc38ac3c85',
    checkId: '22336fd1-c407-4bf7-a793-91c2246fd08f',
    checkType: 'BROWSER',
    name: 'Checkout journey',
    status: 'PROGRESS',
    startedAt: '2026-07-21T12:00:00.000Z',
    stoppedAt: null,
    timeElapsed: 0,
    runLocations: ['eu-west-1'],
    runSource: 'TRIGGER_API',
  },
]

const completedSessions: CompletedCheckSession[] = pendingSessions.map((session, index) => ({
  ...session,
  status: index === 0 ? 'PASSED' : 'DEGRADED',
  stoppedAt: '2026-07-21T12:00:01.000Z',
  timeElapsed: 1_000,
  results: [],
}))

function defaultFlags (overrides: Record<string, unknown> = {}) {
  return {
    'tags': undefined,
    'check-id': undefined,
    'refresh-cache': false,
    'timeout': 600,
    'detach': false,
    'fail-on-no-matching': true,
    'output': 'table',
    ...overrides,
  }
}

function createCommandContext (flags: Record<string, unknown>) {
  const logged: string[] = []
  return {
    parse: vi.fn().mockResolvedValue({ flags }),
    error: vi.fn((message: string) => {
      throw new Error(message)
    }),
    log: vi.fn((message?: string) => {
      if (message) logged.push(message)
    }),
    style: {
      outputFormat: undefined,
      actionStart: vi.fn(),
      actionStatus: vi.fn(),
      actionSuccess: vi.fn(),
      actionFailure: vi.fn(),
      longError: vi.fn(),
    },
    logged,
  }
}

describe('checks run command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(api.checkSessions.trigger).mockResolvedValue({ sessions: pendingSessions })
    vi.mocked(api.checkSessions.pollUntilComplete)
      .mockImplementation(id => Promise.resolve(completedSessions.find(session => session.checkSessionId === id)!))
  })

  it('maps selectors to the public check sessions API and waits by default', async () => {
    const ctx = createCommandContext(defaultFlags({
      'tags': ['production,api', 'critical'],
      'check-id': [pendingSessions[0].checkId],
      'refresh-cache': true,
      'timeout': 120,
    }))

    await ChecksRun.prototype.run.call(ctx as any)

    expect(api.checkSessions.trigger).toHaveBeenCalledWith({
      target: {
        matchTags: [['production', 'api'], ['critical']],
        checkId: [pendingSessions[0].checkId],
      },
      refreshCache: true,
    })
    expect(api.checkSessions.pollUntilComplete).toHaveBeenCalledTimes(2)
    expect(api.checkSessions.pollUntilComplete).toHaveBeenCalledWith(
      pendingSessions[0].checkSessionId,
      expect.any(Number),
    )
    expect(ctx.style.actionStart).toHaveBeenCalledWith('Waiting for check sessions to complete...')
    expect(ctx.style.actionSuccess).toHaveBeenCalled()
    expect(ctx.logged[0]).toContain('2 check sessions completed')
    expect(process.exitCode).toBeUndefined()
  })

  it('omits the target when no selectors are provided', async () => {
    const ctx = createCommandContext(defaultFlags({ detach: true }))

    await ChecksRun.prototype.run.call(ctx as any)

    expect(api.checkSessions.trigger).toHaveBeenCalledWith({ refreshCache: false })
  })

  it('detaches without requesting completion', async () => {
    const ctx = createCommandContext(defaultFlags({ detach: true }))

    await ChecksRun.prototype.run.call(ctx as any)

    expect(api.checkSessions.pollUntilComplete).not.toHaveBeenCalled()
    expect(ctx.style.actionStart).not.toHaveBeenCalled()
    expect(ctx.logged[0]).toContain('2 check sessions started.')
  })

  it('prints a stable JSON envelope without spinner output', async () => {
    const ctx = createCommandContext(defaultFlags({ output: 'json' }))

    await ChecksRun.prototype.run.call(ctx as any)

    expect(JSON.parse(ctx.logged[0])).toEqual({ sessions: completedSessions })
    expect(ctx.style.actionStart).not.toHaveBeenCalled()
  })

  it.each(['FAILED', 'TIMED_OUT', 'CANCELLED'] as const)('exits 1 when a session is %s', async status => {
    vi.mocked(api.checkSessions.pollUntilComplete).mockResolvedValue({
      ...completedSessions[0],
      status,
    })
    vi.mocked(api.checkSessions.trigger).mockResolvedValue({ sessions: [pendingSessions[0]] })
    const ctx = createCommandContext(defaultFlags())

    await ChecksRun.prototype.run.call(ctx as any)

    expect(process.exitCode).toBe(1)
  })

  it('fails by default when no checks match', async () => {
    vi.mocked(api.checkSessions.trigger).mockRejectedValue(new NoMatchingChecksError())
    const ctx = createCommandContext(defaultFlags())

    await ChecksRun.prototype.run.call(ctx as any)

    expect(ctx.logged).toContain('No matching checks were found.')
    expect(process.exitCode).toBe(1)
  })

  it('can succeed when no checks match', async () => {
    vi.mocked(api.checkSessions.trigger).mockRejectedValue(new NoMatchingChecksError())
    const ctx = createCommandContext(defaultFlags({ 'fail-on-no-matching': false }))

    await ChecksRun.prototype.run.call(ctx as any)

    expect(process.exitCode).toBeUndefined()
  })

  it('reports an overall completion timeout and leaves sessions running', async () => {
    vi.mocked(api.checkSessions.trigger).mockResolvedValue({ sessions: [pendingSessions[0]] })
    vi.mocked(api.checkSessions.pollUntilComplete)
      .mockRejectedValue(new CheckSessionWaitTimeoutError(pendingSessions[0].checkSessionId))
    const ctx = createCommandContext(defaultFlags())

    await ChecksRun.prototype.run.call(ctx as any)

    expect(ctx.style.actionFailure).toHaveBeenCalled()
    expect(ctx.style.longError).toHaveBeenCalledWith(
      'Timed out waiting for check sessions.',
      expect.stringContaining('--detach'),
    )
    expect(process.exitCode).toBe(1)
  })

  it('rejects a non-positive timeout before scheduling', async () => {
    const ctx = createCommandContext(defaultFlags({ timeout: 0 }))

    await expect(ChecksRun.prototype.run.call(ctx as any))
      .rejects
      .toThrow('--timeout must be an integer greater than 0.')
    expect(api.checkSessions.trigger).not.toHaveBeenCalled()
  })

  it('has intentional command metadata', () => {
    expect(ChecksRun.readOnly).toBe(false)
    expect(ChecksRun.destructive).toBe(false)
    expect(ChecksRun.idempotent).toBe(false)
  })
})
