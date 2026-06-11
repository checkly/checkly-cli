import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckResult } from '../../rest/check-results.js'

vi.mock('../../rest/api.js', () => ({
  checks: { get: vi.fn() },
  checkStatuses: { get: vi.fn() },
  checkResults: { get: vi.fn(), getAll: vi.fn() },
  errorGroups: { getByCheckId: vi.fn(), get: vi.fn() },
  analytics: { get: vi.fn() },
}))

import * as api from '../../rest/api.js'
import ChecksGet from '../checks/get.js'
import { stripAnsi } from '../../formatters/render.js'

function makeResult (overrides: Partial<CheckResult>): CheckResult {
  return {
    id: 'r',
    checkId: 'check-1',
    name: 'Login flow',
    hasFailures: false,
    hasErrors: false,
    isDegraded: false,
    overMaxResponseTime: false,
    runLocation: 'eu-west-1',
    startedAt: '2026-05-20T08:00:00.000Z',
    stoppedAt: '2026-05-20T08:00:04.000Z',
    created_at: '2026-05-20T08:00:04.000Z',
    responseTime: 4000,
    checkRunId: 1,
    attempts: 1,
    resultType: 'FINAL',
    sequenceId: 'seq-1',
    ...overrides,
  }
}

function createCommandContext (parsed: unknown) {
  const logged: string[] = []
  return Object.assign(Object.create(ChecksGet.prototype), {
    parse: vi.fn().mockResolvedValue(parsed),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    style: { outputFormat: undefined, longError: vi.fn() },
    logged,
  })
}

// A sequence of two failed attempts followed by a passing final run.
const attempt1 = makeResult({ id: 'a1', resultType: 'ATTEMPT', hasFailures: true, attempts: 1, startedAt: '2026-05-20T08:00:00.000Z' })
const attempt2 = makeResult({ id: 'a2', resultType: 'ATTEMPT', hasFailures: true, attempts: 2, startedAt: '2026-05-20T08:00:30.000Z' })
const finalRun = makeResult({ id: 'final', resultType: 'FINAL', attempts: 3, startedAt: '2026-05-20T08:01:00.000Z' })

describe('checks get --include-attempts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    // List returns the whole sequence newest-first (as the API does).
    vi.mocked(api.checkResults.getAll).mockResolvedValue({
      data: { entries: [finalRun, attempt2, attempt1], nextId: null, length: 3 },
    } as any)
  })

  it('renders the full sequence even when drilling into the first attempt', async () => {
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: attempt1 } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'result': 'a1', 'include-attempts': true, 'output': 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    const out = stripAnsi(ctx.logged.join('\n'))
    expect(out).toContain('ATTEMPTS')
    // every run in the sequence is present, not just the one we drilled into
    expect(out).toContain('a1')
    expect(out).toContain('a2')
    expect(out).toContain('final')
    expect(out).toContain('(FINAL)')
    // viewing an attempt: jump to the final, plus a generic View attempt hint
    expect(out).toContain('Show final result')
    expect(out).toContain('--result final')
    expect(out).toContain('View attempt')
    expect(out).toContain('--result <result-id>')
    expect(out.match(/View attempt/g) ?? []).toHaveLength(1)
  })

  it('maps include-attempts to an ALL result query around the requested result', async () => {
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: attempt1 } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'result': 'a1', 'include-attempts': true, 'output': 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    const anchorSeconds = Math.floor(new Date(attempt1.startedAt).getTime() / 1000)
    expect(api.checkResults.getAll).toHaveBeenCalledWith('check-1', expect.objectContaining({
      resultType: 'ALL',
      from: anchorSeconds - 30 * 60,
      to: anchorSeconds + 30 * 60,
      limit: 100,
    }))
  })

  it('continues fetching attempt pages until the sequence window is exhausted', async () => {
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: finalRun } as any)
    vi.mocked(api.checkResults.getAll)
      .mockResolvedValueOnce({
        data: { entries: [finalRun], nextId: 'cursor-2', length: 1 },
      } as any)
      .mockResolvedValueOnce({
        data: { entries: [attempt2, attempt1], nextId: null, length: 2 },
      } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'result': 'final', 'include-attempts': true, 'output': 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    expect(api.checkResults.getAll).toHaveBeenCalledTimes(2)
    expect(api.checkResults.getAll).toHaveBeenNthCalledWith(2, 'check-1', expect.objectContaining({
      resultType: 'ALL',
      nextId: 'cursor-2',
    }))
    const out = stripAnsi(ctx.logged.join('\n'))
    expect(out).toContain('a1')
    expect(out).toContain('a2')
    expect(out).toContain('final')
  })

  it('wraps result and attempts in a stable JSON envelope', async () => {
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: finalRun } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'result': 'final', 'include-attempts': true, 'output': 'json' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    const payload = JSON.parse(ctx.logged[0])
    expect(payload.result.id).toBe('final')
    expect(payload.attempts.map((r: CheckResult) => r.id)).toEqual(['a1', 'a2', 'final'])
  })

  it('reports an error instead of pretending there are no retries when fetching attempts fails', async () => {
    const error = new Error('attempt list failed')
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: finalRun } as any)
    vi.mocked(api.checkResults.getAll).mockRejectedValue(error)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'result': 'final', 'include-attempts': true, 'output': 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    expect(process.exitCode).toBe(1)
    expect(ctx.logged).toEqual([])
    expect(ctx.style.longError).toHaveBeenCalledWith('Failed to get check details.', error)
  })

  it('viewing an attempt with no other attempts shows only the final hint', async () => {
    const onlyAttempt = makeResult({ id: 'a1', resultType: 'ATTEMPT', hasFailures: true, attempts: 1 })
    const onlyFinal = makeResult({ id: 'final', resultType: 'FINAL', attempts: 2 })
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: onlyAttempt } as any)
    vi.mocked(api.checkResults.getAll).mockResolvedValue({
      data: { entries: [onlyFinal, onlyAttempt], nextId: null, length: 2 },
    } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'result': 'a1', 'include-attempts': true, 'output': 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    const out = stripAnsi(ctx.logged.join('\n'))
    expect(out).toContain('Show final result')
    expect(out).toContain('--result final')
    expect(out).not.toContain('View attempt')
  })

  it('viewing the final links to the lone attempt directly', async () => {
    const oneAttempt = makeResult({ id: 'a1', resultType: 'ATTEMPT', hasFailures: true, attempts: 1 })
    const theFinal = makeResult({ id: 'final', resultType: 'FINAL', attempts: 2 })
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: theFinal } as any)
    vi.mocked(api.checkResults.getAll).mockResolvedValue({
      data: { entries: [theFinal, oneAttempt], nextId: null, length: 2 },
    } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'result': 'final', 'include-attempts': true, 'output': 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    const out = stripAnsi(ctx.logged.join('\n'))
    expect(out).not.toContain('Show final result')
    expect(out).toContain('View attempt')
    expect(out).toContain('--result a1')
  })

  it('uses a generic placeholder for View attempt when 2+ other attempts exist', async () => {
    const attempt3 = makeResult({ id: 'a3', resultType: 'ATTEMPT', hasFailures: true, attempts: 3, startedAt: '2026-05-20T08:00:45.000Z' })
    const finalRun4 = makeResult({ id: 'final', resultType: 'FINAL', attempts: 4, startedAt: '2026-05-20T08:01:00.000Z' })
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: attempt1 } as any)
    vi.mocked(api.checkResults.getAll).mockResolvedValue({
      data: { entries: [finalRun4, attempt3, attempt2, attempt1], nextId: null, length: 4 },
    } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'result': 'a1', 'include-attempts': true, 'output': 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    const out = stripAnsi(ctx.logged.join('\n'))
    // viewing a1, two other attempts (a2, a3) remain → placeholder, single hint
    expect(out).toContain('Show final result')
    expect(out).toContain('--result <result-id>')
    expect(out.match(/View attempt/g) ?? []).toHaveLength(1)
  })

  it('flags an attempt result and suggests the full sequence when viewed without --include-attempts', async () => {
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: attempt1 } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { result: 'a1', output: 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    const out = stripAnsi(ctx.logged.join('\n'))
    expect(out).toContain('intermediate retry attempt')
    expect(out).toContain('Show attempts')
    expect(out).toContain('--include-attempts')
    // no list call should happen on the plain attempt view
    expect(api.checkResults.getAll).not.toHaveBeenCalled()
  })

  it('notes the retry count on a retried final viewed without --include-attempts', async () => {
    const retriedFinal = makeResult({ id: 'final', resultType: 'FINAL', attempts: 3 })
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: retriedFinal } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { result: 'final', output: 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    const out = stripAnsi(ctx.logged.join('\n'))
    expect(out).toContain('this run was retried 2 times before this final result')
    expect(out).toContain('Show attempts')
    expect(api.checkResults.getAll).not.toHaveBeenCalled()
  })

  it('shows no retry note on a single-run final', async () => {
    const single = makeResult({ id: 'only', resultType: 'FINAL', attempts: 1 })
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: single } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { result: 'only', output: 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    const out = stripAnsi(ctx.logged.join('\n'))
    expect(out).not.toContain('was retried')
    expect(out).not.toContain('Show attempts')
  })

  it('says "ran once" when the sequence has no attempt rows', async () => {
    const single = makeResult({ id: 'only', resultType: 'FINAL', attempts: 1 })
    vi.mocked(api.checkResults.get).mockResolvedValue({ data: single } as any)
    vi.mocked(api.checkResults.getAll).mockResolvedValue({
      data: { entries: [single], nextId: null, length: 1 },
    } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'result': 'only', 'include-attempts': true, 'output': 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    const out = stripAnsi(ctx.logged.join('\n'))
    expect(out).toContain('Ran once, no retry attempts.')
    expect(out).not.toContain('ATTEMPTS')
  })
})
