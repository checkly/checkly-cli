import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AbstractCheckRunner, { Events, SequenceId } from '../abstract-check-runner'

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that pull these in
// ---------------------------------------------------------------------------

vi.mock('prompts', () => ({
  default: vi.fn(),
}))

vi.mock('../../reporters/util', async importOriginal => {
  const actual = await importOriginal<typeof import('../../reporters/util')>()
  return {
    ...actual,
    isInteractiveTerminal: vi.fn(() => true),
  }
})

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
import { isInteractiveTerminal } from '../../reporters/util'

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

  it('registers a SIGINT handler during run() when detach is false', async () => {
    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(false)
    await runner.run()

    const sigintCalls = onSpy.mock.calls.filter(([event]) => event === 'SIGINT')
    expect(sigintCalls).toHaveLength(1)
  })

  it('does not register a SIGINT handler during run() when detach is true', async () => {
    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(true)
    await runner.run()

    const sigintCalls = onSpy.mock.calls.filter(([event]) => event === 'SIGINT')
    expect(sigintCalls).toHaveLength(0)
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

  it('emits Events.CANCEL with testSessionId and resumes the queue when user confirms cancellation', async () => {
    vi.mocked(prompts).mockResolvedValueOnce({ confirmed: true })

    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(false)
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

    const runner = makeRunner(false)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-double', checks: [] })

    await runner.run()

    const sigintHandler = onSpy.mock.calls.find(([e]) => e === 'SIGINT')?.[1] as (() => void) | undefined

    // First SIGINT — starts the prompt
    sigintHandler?.()

    // Wait past the 100ms debounce window before the second deliberate press
    await new Promise(resolve => setTimeout(resolve, 110))

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
    vi.spyOn(process, 'once').mockReturnValue(process)
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    const runner = makeRunner(false)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-decline', checks: [] })

    const cancelEvents: unknown[] = []
    runner.on(Events.CANCEL, id => cancelEvents.push(id))

    await runner.run()
    sigintHandler?.()

    // Wait for the two setImmediate hops + prompt resolution to fully settle
    await vi.waitFor(() => expect(cancelEvents).toHaveLength(0), { timeout: 500 })
    expect(cancelEvents).toHaveLength(0)
  })

  it('treats undefined prompt result as decline (no forceQuit, no CANCEL emit)', async () => {
    vi.mocked(prompts).mockResolvedValueOnce({ confirmed: undefined })

    const onSpy = vi.spyOn(process, 'on').mockReturnValue(process)
    vi.spyOn(process, 'off').mockReturnValue(process)
    vi.spyOn(process, 'once').mockReturnValue(process)
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as never)
    vi.spyOn(process, 'removeAllListeners').mockReturnValue(process)
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    const runner = makeRunner(false)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-undefined', checks: [] })

    const cancelEvents: unknown[] = []
    runner.on(Events.CANCEL, id => cancelEvents.push(id))

    await runner.run()
    const sigintHandler = onSpy.mock.calls.find(([e]) => e === 'SIGINT')?.[1] as (() => void) | undefined
    sigintHandler?.()

    // Wait for the two setImmediate hops + prompt resolution to fully settle
    await vi.waitFor(() => {
      expect(killSpy).not.toHaveBeenCalledWith(process.pid, 'SIGINT')
      expect(cancelEvents).toHaveLength(0)
    }, { timeout: 500 })
  })

  it('outer SIGINT handler force-quits on second SIGINT while prompt is open', async () => {
    // prompt never resolves — simulates the prompt staying open indefinitely
    vi.mocked(prompts).mockImplementation(() => new Promise(() => {}))

    let sigintHandler: (() => void) | undefined
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: any) => {
      if (event === 'SIGINT') sigintHandler = listener
      return process
    })
    vi.spyOn(process, 'off').mockReturnValue(process)
    vi.spyOn(process, 'removeAllListeners').mockReturnValue(process)
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as never)

    const runner = makeRunner(false)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-x', checks: [] })

    await runner.run()

    // First SIGINT — opens prompt (isAskingToCancel becomes true)
    sigintHandler?.()

    // Wait past the 100ms debounce window before the second deliberate press
    await new Promise(resolve => setTimeout(resolve, 110))

    // Second SIGINT — outer handler hits isAskingToCancel === true branch → forceQuit
    sigintHandler?.()

    await vi.waitFor(() => expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGINT'))
  })

  it('debounces duplicate SIGINTs delivered within 100ms', async () => {
    // Some terminal stacks (Ghostty + fish + Node 22.14+) fire SIGINT twice for
    // a single Ctrl+C. The handler ignores the second signal if it arrives within
    // 100ms of the first.
    vi.mocked(prompts).mockResolvedValue({ confirmed: false })

    let sigintHandler: (() => void) | undefined
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: any) => {
      if (event === 'SIGINT') sigintHandler = listener
      return process
    })
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(false)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-debounce', checks: [] })

    await runner.run()

    const promptsMock = vi.mocked(prompts)
    promptsMock.mockClear()

    // Fire SIGINT twice within 10ms — second must be swallowed
    sigintHandler?.()
    sigintHandler?.()

    await vi.waitFor(() => expect(promptsMock).toHaveBeenCalledTimes(1), { timeout: 500 })
    expect(promptsMock).toHaveBeenCalledTimes(1)
  })
  it('emits Events.CANCEL immediately without showing a prompts dialog when terminal is non-interactive', async () => {
    // In non-interactive environments (CI, piped stdin) isInteractiveTerminal() returns false.
    // The cancel confirmation dialog must be skipped and CANCEL emitted straight away.
    vi.mocked(isInteractiveTerminal).mockReturnValue(false)

    let sigintHandler: (() => void) | undefined
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: any) => {
      if (event === 'SIGINT') sigintHandler = listener
      return process
    })
    vi.spyOn(process, 'off').mockReturnValue(process)

    const runner = makeRunner(false)
    runner.scheduleChecks = vi.fn().mockResolvedValue({ testSessionId: 'ts-noninteractive', checks: [] })

    const cancelEvents: unknown[] = []
    runner.on(Events.CANCEL, id => cancelEvents.push(id))

    await runner.run()

    const promptsMock = vi.mocked(prompts)
    promptsMock.mockClear()

    sigintHandler?.()

    await vi.waitFor(() => expect(cancelEvents).toHaveLength(1))
    expect(cancelEvents[0]).toBe('ts-noninteractive')
    expect(promptsMock).not.toHaveBeenCalled()
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
