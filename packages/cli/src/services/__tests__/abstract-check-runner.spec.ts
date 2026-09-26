import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AbstractCheckRunner, {
  DEFAULT_CHECK_RUN_TIMEOUT_SECONDS,
  DEFAULT_PLAYWRIGHT_CHECK_RUN_TIMEOUT_SECONDS,
  Events,
  SequenceId,
} from '../abstract-check-runner.js'

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
import { assets, testSessions } from '../../rest/api.js'
import { PlaywrightCheck } from '../../constructs/index.js'
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

// ---------------------------------------------------------------------------
// Timeout racing an in-flight result.
//
// These interleavings were found by the Lean model in formal/check-runner
// (property `finish-once`, `run-finished-sound`, `no-late-events`). The timeout
// timer runs outside the serial message queue, so it can fire while
// `processMessage()` is suspended in an `await` (fetching logs for a failed or
// verbose result, pulling snapshots). Without claiming the check first, the
// check is then reported twice and RUN_FINISHED fires early.
// ---------------------------------------------------------------------------

describe('AbstractCheckRunner — timeout racing an in-flight result', () => {
  /** Two checks: an API check on the default timeout and a Playwright check, which gets the longer default. */
  class TwoCheckRunner extends AbstractCheckRunner {
    scheduleChecks (): Promise<{
      testSessionId?: string
      checks: Array<{ check: any, sequenceId: SequenceId }>
    }> {
      const playwrightCheck = Object.create(PlaywrightCheck.prototype)
      playwrightCheck.logicalId = 'pw'
      return Promise.resolve({
        testSessionId: 'ts-race',
        checks: [
          { check: { logicalId: 'api' }, sequenceId: 'seq-api' },
          { check: playwrightCheck, sequenceId: 'seq-pw' },
        ],
      })
    }
  }

  const flush = async () => {
    for (let i = 0; i < 25; i++) await Promise.resolve()
  }

  const resultTopic = (sequenceId: string) =>
    `account/acc-1/ad-hoc-check-results/suite-1/${sequenceId}/run-1/result`

  let messageHandler: ((topic: string, raw: string) => void) | undefined
  let events: string[]

  const record = (runner: AbstractCheckRunner) => {
    for (const event of [
      Events.CHECK_SUCCESSFUL, Events.CHECK_FAILED, Events.CHECK_ATTEMPT_RESULT,
      Events.CHECK_FINISHED, Events.RUN_FINISHED,
    ]) {
      runner.on(event, (arg: any) => {
        events.push(`${event}:${typeof arg === 'string' ? arg : arg?.logicalId ?? ''}`)
      })
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    events = []
    messageHandler = undefined
    vi.mocked(SocketClient.connect).mockResolvedValue({
      on: vi.fn((_event: string, handler: any) => {
        messageHandler = handler
      }),
      subscribeAsync: vi.fn().mockResolvedValue(undefined),
      endAsync: vi.fn().mockResolvedValue(undefined),
    } as any)
    vi.spyOn(process, 'rawListeners').mockReturnValue([])
    vi.spyOn(process, 'removeAllListeners').mockReturnValue(process)
    vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reports a check exactly once when its timeout fires while the FINAL result is fetching logs', async () => {
    const runner = new TwoCheckRunner('acc-1', DEFAULT_CHECK_RUN_TIMEOUT_SECONDS, false)
    record(runner)
    let resolveLogs!: (value: unknown) => void
    vi.mocked(assets.getLogs).mockReturnValue(new Promise(resolve => {
      resolveLogs = resolve
    }) as any)

    const run = runner.run()
    await flush()
    expect(messageHandler).toBeDefined()

    // FINAL result with failures -> processMessage awaits assets.getLogs()
    messageHandler!(resultTopic('seq-api'), JSON.stringify({
      result: { hasFailures: true, assets: { logs: 'logs.json' } },
      testResultId: 'tr-1',
      resultType: 'FINAL',
    }))
    await flush()
    expect(assets.getLogs).toHaveBeenCalledTimes(1)

    // The API check's timeout fires while the result is still in flight.
    await vi.advanceTimersByTimeAsync(DEFAULT_CHECK_RUN_TIMEOUT_SECONDS * 1000)
    resolveLogs([])
    await flush()

    // The result that arrived wins; the check is terminal exactly once.
    expect(events.filter(e => e === `${Events.CHECK_FINISHED}:api`)).toHaveLength(1)
    expect(events).toContain(`${Events.CHECK_SUCCESSFUL}:seq-api`)
    expect(events).not.toContain(`${Events.CHECK_FAILED}:seq-api`)
    // The Playwright check is still running, so the run must not be finished.
    expect(events.filter(e => e.startsWith(Events.RUN_FINISHED))).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(DEFAULT_PLAYWRIGHT_CHECK_RUN_TIMEOUT_SECONDS * 1000)
    await run
    expect(events.filter(e => e === `${Events.CHECK_FINISHED}:pw`)).toHaveLength(1)
    expect(events.filter(e => e.startsWith(Events.RUN_FINISHED))).toHaveLength(1)
  })

  it('does not report an ATTEMPT result after the check already timed out during the fetch', async () => {
    const runner = new TwoCheckRunner('acc-1', DEFAULT_CHECK_RUN_TIMEOUT_SECONDS, false)
    record(runner)
    let resolveLogs!: (value: unknown) => void
    vi.mocked(assets.getLogs).mockReturnValue(new Promise(resolve => {
      resolveLogs = resolve
    }) as any)

    const run = runner.run()
    await flush()

    messageHandler!(resultTopic('seq-api'), JSON.stringify({
      result: { hasFailures: true, assets: { logs: 'logs.json' } },
      testResultId: 'tr-1',
      resultType: 'ATTEMPT',
    }))
    await flush()
    expect(assets.getLogs).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(DEFAULT_CHECK_RUN_TIMEOUT_SECONDS * 1000)
    expect(events).toContain(`${Events.CHECK_FAILED}:seq-api`)
    resolveLogs([])
    await flush()

    const apiEvents = events.filter(e => e.endsWith(':seq-api') || e.endsWith(':api'))
    expect(apiEvents.indexOf(`${Events.CHECK_ATTEMPT_RESULT}:seq-api`)).toBe(-1)

    await vi.advanceTimersByTimeAsync(DEFAULT_PLAYWRIGHT_CHECK_RUN_TIMEOUT_SECONDS * 1000)
    await run
  })

  const topic = (sequenceId: string, subtopic: string) =>
    `account/acc-1/ad-hoc-check-results/suite-1/${sequenceId}/run-1/${subtopic}`

  it('restarts the timeout when an ATTEMPT result arrives, so a retry sequence is not cut short', async () => {
    const runner = new TwoCheckRunner('acc-1', DEFAULT_CHECK_RUN_TIMEOUT_SECONDS, false)
    record(runner)
    const run = runner.run()
    await flush()

    // 500s in, the first attempt fails and the backend has queued a retry.
    await vi.advanceTimersByTimeAsync(500_000)
    messageHandler!(topic('seq-api', 'result'), JSON.stringify({
      result: { hasFailures: true },
      resultType: 'ATTEMPT',
    }))
    await flush()
    expect(events).toContain(`${Events.CHECK_ATTEMPT_RESULT}:seq-api`)

    // 1000s after the start (400s past the original timeout) the check is still alive.
    await vi.advanceTimersByTimeAsync(500_000)
    expect(events).not.toContain(`${Events.CHECK_FAILED}:seq-api`)

    messageHandler!(topic('seq-api', 'result'), JSON.stringify({
      result: { hasFailures: false },
      resultType: 'FINAL',
    }))
    await flush()
    expect(events).toContain(`${Events.CHECK_SUCCESSFUL}:seq-api`)
    expect(events.filter(e => e === `${Events.CHECK_FINISHED}:api`)).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(DEFAULT_PLAYWRIGHT_CHECK_RUN_TIMEOUT_SECONDS * 1000)
    await run
  })

  it('restarts the timeout on run-start and still times out a full window after it', async () => {
    const runner = new TwoCheckRunner('acc-1', DEFAULT_CHECK_RUN_TIMEOUT_SECONDS, false)
    record(runner)
    const run = runner.run()
    await flush()

    // The check waited 500s in the scheduling queue before it started running.
    await vi.advanceTimersByTimeAsync(500_000)
    messageHandler!(topic('seq-api', 'run-start'), JSON.stringify({}))
    await flush()

    // 599s after run-start: no timeout yet.
    await vi.advanceTimersByTimeAsync(599_000)
    expect(events).not.toContain(`${Events.CHECK_FAILED}:seq-api`)

    // 600s after run-start with no result: the timeout fires exactly once.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(events.filter(e => e === `${Events.CHECK_FAILED}:seq-api`)).toHaveLength(1)
    expect(events.filter(e => e === `${Events.CHECK_FINISHED}:api`)).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(DEFAULT_PLAYWRIGHT_CHECK_RUN_TIMEOUT_SECONDS * 1000)
    await run
  })
})
