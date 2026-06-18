import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

import { Events } from '../abstract-check-runner.js'
import { registerTestSessionCancelHandler } from '../test-session-cancel.js'

function makeReporter () {
  return {
    onBegin: vi.fn(),
    onCheckInProgress: vi.fn(),
    onCheckAttemptResult: vi.fn(),
    onCheckEnd: vi.fn(),
    onEnd: vi.fn(),
    onError: vi.fn(),
    onSchedulingDelayExceeded: vi.fn(),
    onStreamLogs: vi.fn(),
    onCancel: vi.fn(),
    onDetach: vi.fn(),
  }
}

describe('registerTestSessionCancelHandler', () => {
  it('cancels the whole test session for an agentic-shaped run', async () => {
    const runner = new EventEmitter()
    const reporter = makeReporter()
    const cancelClient = {
      cancelTestSession: vi.fn().mockResolvedValue(undefined),
    }

    registerTestSessionCancelHandler(runner, [reporter], cancelClient)
    runner.emit(Events.CANCEL, 'ts-agentic')
    await vi.waitFor(() => expect(cancelClient.cancelTestSession).toHaveBeenCalled())

    expect(reporter.onCancel).toHaveBeenCalledTimes(1)
    expect(cancelClient.cancelTestSession).toHaveBeenCalledWith({ testSessionId: 'ts-agentic' })
    expect(cancelClient.cancelTestSession).not.toHaveBeenCalledWith(
      expect.objectContaining({ sequenceId: expect.anything() }),
    )
  })

  it('still marks reporters as cancelling when no test session was created', () => {
    const runner = new EventEmitter()
    const reporter = makeReporter()
    const cancelClient = {
      cancelTestSession: vi.fn().mockResolvedValue(undefined),
    }

    registerTestSessionCancelHandler(runner, [reporter], cancelClient)
    runner.emit(Events.CANCEL)

    expect(reporter.onCancel).toHaveBeenCalledTimes(1)
    expect(cancelClient.cancelTestSession).not.toHaveBeenCalled()
  })
})
