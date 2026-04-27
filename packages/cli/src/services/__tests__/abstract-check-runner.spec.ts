import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AbstractCheckRunner, { Events, SequenceId } from '../abstract-check-runner'

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that pull these in
// ---------------------------------------------------------------------------

vi.mock('prompts', () => ({
  default: vi.fn(),
}))

vi.mock('../../rest/api', () => ({
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

vi.mock('../socket-client', () => ({
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

import prompts from 'prompts'
import { SocketClient } from '../socket-client'

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
    // vi.restoreAllMocks() in afterEach calls mockReset() which clears mockResolvedValue implementations.
    // Re-establish SocketClient.connect so run() can proceed past the socket setup and reach process.on('SIGINT', ...).
    vi.mocked(SocketClient.connect).mockResolvedValue({
      on: vi.fn(),
      subscribeAsync: vi.fn().mockResolvedValue(undefined),
      endAsync: vi.fn().mockResolvedValue(undefined),
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers a SIGINT handler during run() when detach is true', async () => {
    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(true)
    await runner.run()

    const sigintCalls = onSpy.mock.calls.filter(([event]) => event === 'SIGINT')
    expect(sigintCalls).toHaveLength(1)
  })

  it('does not register a SIGINT handler during run() when detach is false', async () => {
    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(false)
    await runner.run()

    const sigintCalls = onSpy.mock.calls.filter(([event]) => event === 'SIGINT')
    expect(sigintCalls).toHaveLength(0)
  })

  it('removes the SIGINT handler in the finally block after run() completes', async () => {
    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    const offSpy = vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(true)
    await runner.run()

    const registeredHandler = onSpy.mock.calls.find(([e]) => e === 'SIGINT')?.[1] as (() => void) | undefined
    const removedHandlers = offSpy.mock.calls
      .filter(([event]) => event === 'SIGINT')
      .map(([, listener]) => listener)

    expect(registeredHandler).toBeDefined()
    expect(removedHandlers).toContain(registeredHandler)
  })

  it('emits Events.CANCEL with testSessionId and resumes the queue when user confirms cancellation', async () => {
    vi.mocked(prompts).mockResolvedValueOnce({ confirmed: true })

    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(true)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-cancel', checks: [] })

    const cancelEvents: unknown[] = []
    runner.on(Events.CANCEL, id => cancelEvents.push(id))

    // Spy on queue.start to verify the queue is resumed (not cleared) after cancellation
    await runner.run()
    const queueStartSpy = vi.spyOn(runner.queue, 'start')

    const sigintHandler = onSpy.mock.calls.find(([e]) => e === 'SIGINT')?.[1] as (() => void) | undefined

    // Simulate SIGINT
    sigintHandler?.()

    // Wait for the async prompt resolution
    await vi.waitFor(() => expect(cancelEvents).toHaveLength(1))
    expect(cancelEvents[0]).toBe('ts-cancel')
    expect(queueStartSpy).toHaveBeenCalledTimes(1)
  })

  it('calls process.kill(process.pid, SIGINT) on a second SIGINT while cancel prompt is active', async () => {
    // prompts never resolves (simulating a hanging prompt)
    vi.mocked(prompts).mockImplementation(() => new Promise(() => {}))

    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)
    // forceQuit calls process.removeAllListeners then process.kill — mock kill to avoid terminating the test process
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as never)
    vi.spyOn(process, 'removeAllListeners').mockReturnValue(process)

    const runner = makeRunner(true)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-double', checks: [] })

    await runner.run()

    const sigintHandler = onSpy.mock.calls.find(([e]) => e === 'SIGINT')?.[1] as (() => void) | undefined

    // First SIGINT — starts the prompt
    sigintHandler?.()

    // Second SIGINT — must call process.kill(pid, 'SIGINT')
    sigintHandler?.()
    expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGINT')
  })

  it('does NOT emit Events.CANCEL when user declines the confirmation', async () => {
    vi.mocked(prompts).mockResolvedValueOnce({ confirmed: false })

    let sigintHandler: (() => void) | undefined
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: any) => {
      if (event === 'SIGINT') sigintHandler = listener
      return process
    })
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(true)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-decline', checks: [] })

    const cancelEvents: unknown[] = []
    runner.on(Events.CANCEL, id => cancelEvents.push(id))

    await runner.run()
    sigintHandler?.()

    // Give the microtask queue time to settle
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(cancelEvents).toHaveLength(0)
  })

  it('calls forceQuit when prompts returns undefined (e.g. CTRL+C during the prompt)', async () => {
    vi.mocked(prompts).mockResolvedValueOnce({ confirmed: undefined })

    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)
    // forceQuit calls process.removeAllListeners then process.kill — mock both to avoid terminating the test process
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as never)
    vi.spyOn(process, 'removeAllListeners').mockReturnValue(process)

    const runner = makeRunner(true)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-undefined', checks: [] })

    await runner.run()
    const sigintHandler = onSpy.mock.calls.find(([e]) => e === 'SIGINT')?.[1] as (() => void) | undefined
    sigintHandler?.()

    await vi.waitFor(() => expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGINT'))
  })

  it('calls forceQuit via onCancel when CTRL+C is pressed during the prompts call', async () => {
    // Simulate prompts calling onCancel (the second options argument) synchronously
    vi.mocked(prompts).mockImplementation((_question: any, options: any) => {
      options?.onCancel?.()
      return Promise.resolve({ confirmed: undefined })
    })

    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)
    // forceQuit calls process.removeAllListeners then process.kill — mock both to avoid terminating the test process
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as never)
    vi.spyOn(process, 'removeAllListeners').mockReturnValue(process)

    const runner = makeRunner(true)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-oncancel', checks: [] })

    await runner.run()
    const sigintHandler = onSpy.mock.calls.find(([e]) => e === 'SIGINT')?.[1] as (() => void) | undefined
    sigintHandler?.()

    await vi.waitFor(() => expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGINT'))
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
