import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AbstractCheckRunner, { Events, SequenceId } from '../abstract-check-runner.js'

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that pull these in
// ---------------------------------------------------------------------------

vi.mock('../../rest/api.js', () => ({
  testSessions: {
    run: vi.fn().mockResolvedValue({ data: { testSessionId: 'ts-123', sequenceIds: {} } }),
    getResultShortLinks: vi.fn().mockResolvedValue({ data: {} }),
    pollSchedulingUntilComplete: vi.fn(),
  },
  assets: {
    getLogs: vi.fn().mockResolvedValue([]),
    getCheckRunData: vi.fn().mockResolvedValue({}),
  },
  getDefaults: vi.fn().mockReturnValue({ baseURL: 'https://api.checkly.com', accountId: 'acc-1' }),
}))

vi.mock('../socket-client.js', () => ({
  SocketClient: {
    connect: vi.fn().mockResolvedValue({
      on: vi.fn(),
      subscribeAsync: vi.fn().mockResolvedValue(undefined),
      endAsync: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { SocketClient } from '../socket-client.js'
import { testSessions } from '../../rest/api.js'
import { TestSessionSchedulingFailedError } from '../../rest/test-sessions.js'

/** Minimal concrete subclass — scheduleChecks immediately returns with zero checks so the runner exits cleanly. */
class StubCheckRunner extends AbstractCheckRunner {
  constructor (accountId: string, timeout: number, verbose: boolean, detach: boolean = false) {
    super(accountId, timeout, verbose, detach)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  scheduleChecks (_checkRunSuiteId: string): Promise<{
    testSessionId?: string
    checks: Array<{ check: any, sequenceId: SequenceId }>
  }> {
    return Promise.resolve({ testSessionId: 'ts-stub', checks: [] })
  }
}

function makeRunner (detach = false): StubCheckRunner {
  return new StubCheckRunner('acc-1', 60, false, detach)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AbstractCheckRunner — SIGINT / cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(SocketClient.connect).mockResolvedValue({
      on: vi.fn(),
      subscribeAsync: vi.fn().mockResolvedValue(undefined),
      endAsync: vi.fn().mockResolvedValue(undefined),
    } as any)
    vi.spyOn(process, 'rawListeners').mockReturnValue([])
    vi.spyOn(process, 'removeAllListeners').mockReturnValue(process)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers a SIGINT handler during run() when detach is false', async () => {
    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(false)
    await runner.run()

    const sigintCalls = onSpy.mock.calls.filter(([event]) => event === 'SIGINT')
    expect(sigintCalls).toHaveLength(1)
  })

  it('does not register a SIGINT handler when detach is true', async () => {
    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(true)
    await runner.run()

    const sigintCalls = onSpy.mock.calls.filter(([event]) => event === 'SIGINT')
    expect(sigintCalls).toHaveLength(0)
  })

  it('emits RUN_STARTED and DETACH immediately when detach is true', async () => {
    vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(true)

    const runStartedEvents: unknown[] = []
    const detachEvents: unknown[] = []
    runner.on(Events.RUN_STARTED, (checks, testSessionId) => runStartedEvents.push({ checks, testSessionId }))
    runner.on(Events.DETACH, () => detachEvents.push(true))
    runner.on(Events.RUN_FINISHED, () => detachEvents.push('finished'))

    await runner.run()

    expect(runStartedEvents).toEqual([{ checks: [], testSessionId: 'ts-stub' }])
    expect(detachEvents).toHaveLength(1)
    expect(detachEvents[0]).toBe(true)
  })

  it('removes the SIGINT handler in the finally block after run() completes', async () => {
    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    const offSpy = vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(false)
    await runner.run()

    const registeredHandler = onSpy.mock.calls.find(([e]) => e === 'SIGINT')?.[1] as (() => void) | undefined
    const removedHandlers = offSpy.mock.calls
      .filter(([event]) => event === 'SIGINT')
      .map(([, listener]) => listener)

    expect(registeredHandler).toBeDefined()
    expect(removedHandlers).toContain(registeredHandler)
  })

  it('emits Events.CANCEL with testSessionId on first SIGINT', async () => {
    let sigintHandler: (() => void) | undefined
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: any) => {
      if (event === 'SIGINT') sigintHandler = listener
      return process
    })
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(false)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-cancel', checks: [] })

    const cancelEvents: unknown[] = []
    runner.on(Events.CANCEL, id => cancelEvents.push(id))

    await runner.run()

    sigintHandler?.()

    expect(cancelEvents).toHaveLength(1)
    expect(cancelEvents[0]).toBe('ts-cancel')
  })

  it('calls process.exit(1) on second SIGINT after cancellation', async () => {
    let sigintHandler: (() => void) | undefined
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: any) => {
      if (event === 'SIGINT') sigintHandler = listener
      return process
    })
    vi.spyOn(process, 'off').mockReturnValue(process)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    const runner = makeRunner(false)
    await runner.run()

    sigintHandler?.()

    await new Promise(resolve => setTimeout(resolve, 110))

    sigintHandler?.()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('debounces duplicate SIGINTs delivered within 100ms', async () => {
    let sigintHandler: (() => void) | undefined
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: any) => {
      if (event === 'SIGINT') sigintHandler = listener
      return process
    })
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(false)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-debounce', checks: [] })

    const cancelEvents: unknown[] = []
    runner.on(Events.CANCEL, id => cancelEvents.push(id))

    await runner.run()

    sigintHandler?.()
    sigintHandler?.()

    expect(cancelEvents).toHaveLength(1)
  })
})

describe('AbstractCheckRunner — SocketClient lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('connects SocketClient at the start of run()', async () => {
    vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner()
    await runner.run()

    expect(SocketClient.connect).toHaveBeenCalledTimes(1)
  })

  it('does not connect SocketClient when detach is true', async () => {
    vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(true)
    await runner.run()

    expect(SocketClient.connect).not.toHaveBeenCalled()
  })

  it('calls endAsync on the socket client in the finally block', async () => {
    vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const mockClient = {
      on: vi.fn(),
      subscribeAsync: vi.fn().mockResolvedValue(undefined),
      endAsync: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(SocketClient.connect).mockResolvedValueOnce(mockClient as any)

    const runner = makeRunner()
    await runner.run()

    expect(mockClient.endAsync).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Scheduling watch
// ---------------------------------------------------------------------------

/** Returns a schedulingId and one pending check, so the run only settles via a
 * check result or a scheduling failure. */
class SchedulingStubRunner extends AbstractCheckRunner {
  checksToSchedule: Array<{ check: any, sequenceId: SequenceId }>

  constructor (checks: Array<{ check: any, sequenceId: SequenceId }>) {
    super('acc-1', 60, false, false)
    this.checksToSchedule = checks
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  scheduleChecks (_checkRunSuiteId: string): Promise<{
    testSessionId?: string
    schedulingId?: string
    checks: Array<{ check: any, sequenceId: SequenceId }>
  }> {
    return Promise.resolve({ testSessionId: 'ts-stub', schedulingId: 'op-1', checks: this.checksToSchedule })
  }
}

describe('AbstractCheckRunner — scheduling watch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(SocketClient.connect).mockResolvedValue({
      on: vi.fn(),
      subscribeAsync: vi.fn().mockResolvedValue(undefined),
      endAsync: vi.fn().mockResolvedValue(undefined),
    } as any)
    vi.spyOn(process, 'rawListeners').mockReturnValue([])
    vi.spyOn(process, 'removeAllListeners').mockReturnValue(process)
    vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fails the run immediately when the scheduling operation reports FAILED', async () => {
    vi.mocked(testSessions.pollSchedulingUntilComplete).mockResolvedValue({
      schedulingId: 'op-1',
      testSessionId: 'ts-stub',
      status: 'FAILED',
      checksTotal: 1,
      error: { code: 'SCHEDULING_ERROR', message: 'Unable to find private location' },
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: null,
      endedAt: null,
    })

    const runner = new SchedulingStubRunner([{ check: {}, sequenceId: 'seq-1' }])
    const errors: Error[] = []
    runner.on(Events.ERROR, err => errors.push(err))

    await runner.run()

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(TestSessionSchedulingFailedError)
    expect(errors[0].message).toEqual('Unable to find private location')
    expect(testSessions.pollSchedulingUntilComplete).toHaveBeenCalledWith('op-1', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }))
  })

  it('does not settle the run when the scheduling operation succeeds', async () => {
    vi.mocked(testSessions.pollSchedulingUntilComplete).mockResolvedValue({
      schedulingId: 'op-1',
      testSessionId: 'ts-stub',
      status: 'SUCCEEDED',
      checksTotal: 1,
      error: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: null,
      endedAt: null,
    })

    // One pending check: the run may only settle once that check finishes —
    // the SUCCEEDED watch must neither error nor resolve the race early.
    const runner = new SchedulingStubRunner([{ check: {}, sequenceId: 'seq-1' }])
    const errors: Error[] = []
    let finished = false
    runner.on(Events.ERROR, err => errors.push(err))
    runner.on(Events.RUN_FINISHED, () => {
      finished = true
    })

    const runPromise = runner.run()
    // Let the (mock-resolved) scheduling watch settle before the check does.
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(finished).toBe(false)
    runner.emit(Events.CHECK_FINISHED)
    await runPromise
    ;(runner as any).disableAllTimeouts()

    expect(errors).toHaveLength(0)
    expect(finished).toBe(true)
  })

  it('fails a detached run when dispatch fails', async () => {
    vi.mocked(testSessions.pollSchedulingUntilComplete).mockResolvedValue({
      schedulingId: 'op-1',
      testSessionId: 'ts-stub',
      status: 'FAILED',
      checksTotal: 1,
      error: { code: 'ABANDONED', message: 'the worker stopped reporting progress' },
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: null,
      endedAt: null,
    })

    const runner = new SchedulingStubRunner([{ check: {}, sequenceId: 'seq-1' }])
    ;(runner as any).detach = true
    const errors: Array<Error & { code?: string }> = []
    let detached = false
    runner.on(Events.ERROR, err => errors.push(err))
    runner.on(Events.DETACH, () => {
      detached = true
    })

    await runner.run()

    expect(detached).toBe(false)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(TestSessionSchedulingFailedError)
    expect(errors[0].code).toEqual('ABANDONED')
  })
})
