import type { Reporter } from '../reporters/reporter.js'
import { cancel } from '../rest/api.js'
import { Events } from './abstract-check-runner.js'

type TestSessionCancelEmitter = {
  on(event: Events.CANCEL, listener: (testSessionId?: string) => Promise<void>): unknown
}

type TestSessionCancelClient = {
  cancelTestSession(input: { testSessionId: string }): Promise<unknown>
}

export function registerTestSessionCancelHandler (
  runner: TestSessionCancelEmitter,
  reporters: Reporter[],
  cancelClient: TestSessionCancelClient = cancel,
) {
  runner.on(Events.CANCEL, async testSessionId => {
    // The emitter cannot await this listener, so a rejection here would
    // surface as an unhandled one and take the process down mid-cancellation.
    // Each reporter is guarded on its own, so that one failing reporter
    // neither silences the others nor keeps the cancel request from being sent.
    for (const reporter of reporters) {
      try {
        reporter.onCancel()
      } catch (err: any) {
        process.stderr.write(`Warning: a reporter failed to report the cancellation: ${err?.message ?? err}\n`)
      }
    }

    if (!testSessionId) {
      return
    }

    // The run is already stopping: report that the session was not cancelled,
    // and a second Ctrl+C still forces the exit.
    await cancelTestSessionBestEffort(testSessionId, cancelClient)
  })
}

/**
 * Asks the backend to cancel a test session, and only warns if that fails:
 * the run is ending either way.
 */
export async function cancelTestSessionBestEffort (
  testSessionId: string,
  cancelClient: TestSessionCancelClient = cancel,
): Promise<void> {
  try {
    // Cancellation is intentionally test-session scoped. The backend resolves
    // which running results are cancellable (currently Playwright),
    // so the CLI must not narrow the request by check type or sequence ID here.
    await cancelClient.cancelTestSession({ testSessionId })
  } catch (err: any) {
    process.stderr.write(`Warning: failed to cancel test session ${testSessionId}: ${err?.message ?? err}\n`)
  }
}
