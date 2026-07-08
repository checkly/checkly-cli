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
    reporters.forEach(r => r.onCancel())

    if (!testSessionId) {
      return
    }

    // Cancellation is intentionally test-session scoped. The backend resolves
    // which running results are cancellable (currently Playwright and Agentic),
    // so the CLI must not narrow the request by check type or sequence ID here.
    await cancelClient.cancelTestSession({ testSessionId })
  })
}
