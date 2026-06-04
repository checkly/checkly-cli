import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestSessionsListResponse } from '../../rest/test-sessions.js'

vi.mock('../../rest/api.js', () => ({
  testSessions: { list: vi.fn() },
}))

import * as api from '../../rest/api.js'
import TestSessionsList from '../test-sessions/list.js'

const listResponse: TestSessionsListResponse = {
  length: 1,
  nextId: 'cursor-2',
  entries: [
    {
      id: '8166fa86-c9b4-4162-8541-d380c6c212d8',
      accountId: 'account-id',
      projectId: 'project-id',
      name: 'Production smoke test',
      provider: 'API',
      running: [],
      passed: [],
      failed: ['seq-1'],
      cancelled: [],
      status: 'FAILED',
      region: 'eu-west-1',
      privateLocationId: null,
      invoker: { name: 'Invoker User' },
      repoUrl: null,
      commitId: null,
      commitOwner: 'Herve',
      commitMessage: null,
      branchName: 'main',
      environment: 'production',
      startedAt: '2026-05-20T08:00:00.000Z',
      stoppedAt: '2026-05-20T08:02:03.456Z',
      created_at: '2026-05-20T08:00:00.000Z',
      updated_at: '2026-05-20T08:02:03.456Z',
    },
  ],
}

function createCommandContext (parsed: unknown) {
  const logged: string[] = []
  return {
    parse: vi.fn().mockResolvedValue(parsed),
    error: vi.fn((message: string) => {
      throw new Error(message)
    }),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    style: {
      outputFormat: undefined,
      longError: vi.fn(),
    },
    logged,
  }
}

describe('test-sessions list command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(api.testSessions.list).mockResolvedValue({ data: listResponse } as any)
  })

  it('maps list flags to public API query params and renders table output', async () => {
    const ctx = createCommandContext({
      flags: {
        'limit': 10,
        'cursor': 'cursor-1',
        'from': '2026-05-20T00:00:00Z',
        'to': '2026-05-21T00:00:00Z',
        'status': ['failed'],
        'branch': ['main'],
        'user': ['Herve'],
        'no-users': true,
        'provider': ['api'],
        'search': 'smoke',
        'error-group': 'error-group-id',
        'output': 'table',
      },
    })

    await TestSessionsList.prototype.run.call(ctx as any)

    expect(api.testSessions.list).toHaveBeenCalledWith({
      from: 1_779_235_200,
      to: 1_779_321_600,
      limit: 10,
      statuses: ['FAILED'],
      branches: ['main'],
      users: ['Herve'],
      providers: ['API'],
      noUsers: true,
      nextId: 'cursor-1',
      textSearch: 'smoke',
      errorGroupId: 'error-group-id',
    })
    expect(ctx.logged[0]).toContain('Production smok')
    expect(ctx.logged[0]).toContain('FAILED')
    expect(ctx.logged[0]).toContain('1')
    expect(ctx.logged[0]).toContain('checkly test-sessions list --limit 10')
    expect(ctx.logged[0]).toContain('--cursor cursor-2')
    expect(ctx.logged[0]).toContain('checkly test-sessions get 8166fa86-c9b4-4162-8541-d380c6c212d8')
  })

  it('returns cursor pagination envelope for json output', async () => {
    const ctx = createCommandContext({
      flags: {
        limit: 20,
        output: 'json',
      },
    })

    await TestSessionsList.prototype.run.call(ctx as any)

    expect(JSON.parse(ctx.logged[0])).toEqual({
      data: listResponse.entries,
      pagination: {
        nextId: listResponse.nextId,
        length: listResponse.length,
      },
    })
  })

  it('renders markdown output', async () => {
    const ctx = createCommandContext({
      flags: {
        limit: 20,
        output: 'md',
      },
    })

    await TestSessionsList.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain('| Status | Started | Name | Provider | Branch | User | Running | Passed | Failed | Cancelled | ID |')
    expect(ctx.logged[0]).toContain('| failed |')
  })

  it('rejects invalid time filters', async () => {
    const ctx = createCommandContext({
      flags: {
        limit: 20,
        from: 'not-a-date',
        output: 'table',
      },
    })

    await expect(TestSessionsList.prototype.run.call(ctx as any))
      .rejects
      .toThrow('Invalid --from "not-a-date". Use an ISO date or Unix timestamp in seconds.')
    expect(api.testSessions.list).not.toHaveBeenCalled()
  })

  it('reports API failures without throwing', async () => {
    const ctx = createCommandContext({
      flags: {
        limit: 20,
        output: 'table',
      },
    })
    vi.mocked(api.testSessions.list).mockRejectedValue(new Error('boom'))

    await TestSessionsList.prototype.run.call(ctx as any)

    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to list test sessions.', expect.any(Error))
    expect(process.exitCode).toBe(1)
  })

  it('shell-quotes filters when rendering the next page command', async () => {
    const ctx = createCommandContext({
      flags: {
        limit: 20,
        branch: ['feature with space'],
        search: 'smoke $(echo unsafe)',
        output: 'table',
      },
    })

    await TestSessionsList.prototype.run.call(ctx as any)

    expect(ctx.logged[0]).toContain(`--branch 'feature with space'`)
    expect(ctx.logged[0]).toContain(`--search 'smoke $(echo unsafe)'`)
  })
})
