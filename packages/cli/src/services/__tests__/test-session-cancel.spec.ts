import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

import { Events } from '../abstract-check-runner.js'
import { registerTestSessionCancelHandler } from '../test-session-cancel.js'
import { captureStderr } from '../../testing/capture-stderr.js'

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
  it('cancels the whole test session for a Playwright-shaped run', async () => {
    const runner = new EventEmitter()
    const reporter = makeReporter()
    const cancelClient = {
      cancelTestSession: vi.fn().mockResolvedValue(undefined),
    }

    registerTestSessionCancelHandler(runner, [reporter], cancelClient)
    runner.emit(Events.CANCEL, 'ts-playwright')
    await vi.waitFor(() => expect(cancelClient.cancelTestSession).toHaveBeenCalled())

    expect(reporter.onCancel).toHaveBeenCalledTimes(1)
    expect(cancelClient.cancelTestSession).toHaveBeenCalledWith({ testSessionId: 'ts-playwright' })
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

  it('keeps a failed cancel request from becoming an unhandled rejection', async () => {
    const runner = new EventEmitter()
    const reporter = makeReporter()
    const cancelClient = {
      cancelTestSession: vi.fn().mockRejectedValue(new Error('network down')),
    }

    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)
    try {
      // The listener runs detached from the emitter, which cannot await it:
      // a rejection inside it must not take the process down mid-cancellation.
      const stderr = await captureStderr(async () => {
        registerTestSessionCancelHandler(runner, [reporter], cancelClient)
        runner.emit(Events.CANCEL, 'ts-playwright')
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(unhandled).toEqual([])
      expect(reporter.onCancel).toHaveBeenCalledTimes(1)
      expect(cancelClient.cancelTestSession).toHaveBeenCalledWith({ testSessionId: 'ts-playwright' })
      expect(stderr.join('')).toContain('failed to cancel test session')
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('keeps a throwing reporter from stopping the others or the cancel request', async () => {
    const runner = new EventEmitter()
    const failingReporter = makeReporter()
    failingReporter.onCancel.mockImplementation(() => {
      throw new Error('stdout closed')
    })
    const reporter = makeReporter()
    const cancelClient = {
      cancelTestSession: vi.fn().mockResolvedValue(undefined),
    }

    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)
    try {
      const stderr = await captureStderr(async () => {
        registerTestSessionCancelHandler(runner, [failingReporter, reporter], cancelClient)
        runner.emit(Events.CANCEL, 'ts-playwright')
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(unhandled).toEqual([])
      expect(reporter.onCancel).toHaveBeenCalledTimes(1)
      expect(cancelClient.cancelTestSession).toHaveBeenCalledWith({ testSessionId: 'ts-playwright' })
      expect(stderr.join('')).toContain('a reporter failed to report the cancellation: stdout closed')
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })
})
