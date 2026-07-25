import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AbstractCheckRunner, { Events, SequenceId } from '../abstract-check-runner.js'
import { NoMatchingChecksError } from '../../rest/test-sessions.js'

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that pull these in
// ---------------------------------------------------------------------------

vi.mock('../../rest/api.js', () => ({
  testSessions: {
    run: vi.fn().mockResolvedValue({ data: { testSessionId: 'ts-123', sequenceIds: {} } }),
    getResultShortLinks: vi.fn().mockResolvedValue({ data: {} }),
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

  it('reports safe diagnostics when MQTT connection fails without a message', async () => {
    const connectionError = Object.assign(new Error(''), { code: 'ECONNRESET' })
    vi.mocked(SocketClient.connect).mockRejectedValueOnce(connectionError)
    const runner = makeRunner()
    const errors: Error[] = []
    runner.on(Events.ERROR, error => errors.push(error))

    await runner.run()

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('MQTT connection failed: no error message was provided (code: ECONNRESET)')
  })

  it('omits unsafe MQTT connection error codes from fallback diagnostics', async () => {
    const connectionError = Object.assign(new Error(''), { code: 'api-key=secret-value' })
    vi.mocked(SocketClient.connect).mockRejectedValueOnce(connectionError)
    const runner = makeRunner()
    const errors: Error[] = []
    runner.on(Events.ERROR, error => errors.push(error))

    await runner.run()

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('MQTT connection failed: no error message was provided')
    expect(errors[0].message).not.toContain('secret-value')
  })

  it('preserves useful MQTT connection error messages', async () => {
    const connectionError = new Error('Connection refused')
    vi.mocked(SocketClient.connect).mockRejectedValueOnce(connectionError)
    const runner = makeRunner()
    const errors: Error[] = []
    runner.on(Events.ERROR, error => errors.push(error))

    await runner.run()

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Connection refused')
  })

  it('reports safe diagnostics when MQTT subscription fails without a message', async () => {
    const subscriptionError = Object.assign(new Error(''), { code: 135 })
    const mockClient = {
      on: vi.fn(),
      subscribeAsync: vi.fn().mockRejectedValue(subscriptionError),
      endAsync: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(SocketClient.connect).mockResolvedValueOnce(mockClient as any)
    const runner = makeRunner()
    const errors: Error[] = []
    runner.on(Events.ERROR, error => errors.push(error))

    await runner.run()

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('MQTT subscription failed: no error message was provided (code: 135)')
  })

  it('preserves typed scheduling errors', async () => {
    const mockClient = {
      on: vi.fn(),
      subscribeAsync: vi.fn().mockResolvedValue(undefined),
      endAsync: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(SocketClient.connect).mockResolvedValueOnce(mockClient as any)
    const schedulingError = new NoMatchingChecksError()
    const runner = makeRunner()
    runner.scheduleChecks = vi.fn().mockRejectedValue(schedulingError)
    const errors: Error[] = []
    runner.on(Events.ERROR, error => errors.push(error))

    await runner.run()

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(NoMatchingChecksError)
  })
})
