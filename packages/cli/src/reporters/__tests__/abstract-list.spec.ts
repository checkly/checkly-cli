import { beforeEach, describe, expect, it, vi } from 'vitest'

import ListReporter from '../list.js'
import CiReporter from '../ci.js'
import GithubReporter from '../github.js'
import JsonReporter from '../json.js'
import * as api from '../../rest/api.js'
import type { SequenceId } from '../../services/abstract-check-runner.js'

vi.mock('../../rest/api.js', () => ({
  getDefaults: () => ({
    baseURL: 'https://api.checklyhq.com',
    accountId: 'test-account-123',
    Authorization: 'Bearer test-key',
    apiKey: 'test-key',
  }),
  testSessions: {
    getShortLink: vi.fn(),
  },
}))

const printLnMock = vi.fn()
const printLnErrMock = vi.fn()

vi.mock('../util.js', async () => {
  const actual = await vi.importActual<typeof import('../util.js')>('../util.js')
  return {
    ...actual,
    printLn: (...args: Parameters<typeof actual.printLn>) => printLnMock(...args),
    printLnErr: (...args: Parameters<typeof actual.printLnErr>) => printLnErrMock(...args),
  }
})

const PUBLIC_RUN_LOCATION = { type: 'PUBLIC' as const, region: 'eu-west-1' }

const SOURCE_FILE = 'folder/api.check.ts'
const SEQUENCE_ID: SequenceId = 'seq-001'
const TEST_SESSION_ID = '8166fa86-c9b4-4162-8541-d380c6c212d8'
const TEST_SESSION_URL = `https://app.checklyhq.com/accounts/test-account-123/test-sessions/${TEST_SESSION_ID}`

function makeCheck (sourceFile = SOURCE_FILE) {
  return {
    name: 'My API Check',
    getSourceFile: () => sourceFile,
  }
}

function makePassingResult (sourceFile = SOURCE_FILE) {
  return {
    name: 'My API Check',
    sourceFile,
    hasFailures: false,
    isDegraded: false,
    isCancelled: false,
  }
}

function makeReporterWithOneCheck (testSessionId?: string) {
  const reporter = new ListReporter(PUBLIC_RUN_LOCATION, false)
  const check = makeCheck()
  reporter.onBegin([{ check, sequenceId: SEQUENCE_ID }], testSessionId)
  return { reporter, check }
}

function countOccurrences (text: string, substring: string): number {
  return text.split(substring).length - 1
}

function outputOf (mock: typeof printLnMock): string {
  return mock.mock.calls.map(([text]: [string]) => text).join('\n')
}

type TtyStream = typeof process.stdout | typeof process.stderr

function withTty (stream: TtyStream, isTTY: boolean, callback: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(stream, 'isTTY')
  Object.defineProperty(stream, 'isTTY', { configurable: true, value: isTTY })

  try {
    callback()
  } finally {
    if (descriptor) {
      Object.defineProperty(stream, 'isTTY', descriptor)
    } else {
      delete (stream as { isTTY?: boolean }).isTTY
    }
  }
}

// Both streams on one terminal: the only setup in which the live summary redraws.
function withTerminal (callback: () => void): void {
  withTty(process.stdout, true, () => withTty(process.stderr, true, callback))
}

describe('AbstractListReporter', () => {
  beforeEach(() => {
    printLnMock.mockClear()
    printLnErrMock.mockClear()
    vi.mocked(api.testSessions.getShortLink).mockReset()
  })

  it('should print a test session ID and inspect command when a session is recorded', () => {
    makeReporterWithOneCheck(TEST_SESSION_ID)

    const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
    const output = calls.join('\n')
    expect(output).toContain(`Test session ID: ${TEST_SESSION_ID}`)
    expect(output).toContain(`Inspect session: checkly test-sessions get ${TEST_SESSION_ID} --watch`)
    expect(output).toContain(`Open session: ${TEST_SESSION_URL}`)
  })

  it('should not print test session reference lines when no session is recorded', () => {
    makeReporterWithOneCheck()

    const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
    const output = calls.join('\n')
    expect(output).not.toContain('Test session ID:')
    expect(output).not.toContain('Inspect session:')
    expect(output).not.toContain('Open session:')
  })

  it('should send run progress to stderr and results to stdout', () => {
    const { reporter, check } = makeReporterWithOneCheck(TEST_SESSION_ID)

    // onBegin: "Running N checks" and the live summary are progress.
    expect(outputOf(printLnErrMock)).toContain(`Running 1 checks in ${PUBLIC_RUN_LOCATION.region}`)
    expect(outputOf(printLnMock)).not.toContain(`Running 1 checks`)

    reporter.onCheckInProgress(check, SEQUENCE_ID)
    reporter.onCheckEnd(SEQUENCE_ID, makePassingResult())
    reporter.onEnd()

    const stderr = outputOf(printLnErrMock)
    const stdout = outputOf(printLnMock)

    // Progress: live summaries (with the check title) stay on stderr.
    expect(stderr).toContain('My API Check')
    // Results: the final summary and session reference stay on stdout.
    expect(stdout).toContain('My API Check')
    expect(stdout).toContain('1 passed, 1 total')
    expect(stdout).toContain(`Test session ID: ${TEST_SESSION_ID}`)
  })

  it('should not redraw when stdout is piped, even with a TTY stderr', () => {
    withTty(process.stdout, false, () => withTty(process.stderr, true, () => {
      const { reporter } = makeReporterWithOneCheck()

      reporter._printSummary({ stream: 'stderr' })

      expect(reporter._clearString).toBe('')
    }))
  })

  for (const Reporter of [CiReporter, GithubReporter, JsonReporter]) {
    it(`${Reporter.name} announces the run on stderr`, () => {
      const reporter = new Reporter(PUBLIC_RUN_LOCATION, false)
      reporter.onBegin([{ check: { name: 'My API Check', getSourceFile: () => SOURCE_FILE }, sequenceId: SEQUENCE_ID }] as any)

      expect(outputOf(printLnErrMock)).toContain(`Running 1 checks in ${PUBLIC_RUN_LOCATION.region}`)
      expect(outputOf(printLnMock)).not.toContain('Running 1 checks')
    })
  }

  it('should populate _clearString after a live summary renders on a terminal', () => {
    withTerminal(() => {
      const { reporter } = makeReporterWithOneCheck()

      reporter._printSummary({ stream: 'stderr' })

      expect(reporter._clearString).not.toBe('')
    })
  })

  it('should not populate _clearString without a TTY stderr', () => {
    withTty(process.stderr, false, () => {
      const { reporter } = makeReporterWithOneCheck()

      reporter._printSummary({ stream: 'stderr' })

      expect(reporter._clearString).toBe('')
    })
  })

  it('should not register erase codes for a final summary on stdout, even on a terminal', () => {
    withTerminal(() => {
      const { reporter } = makeReporterWithOneCheck()
      // Erase the live summary that onBegin drew; erase codes pair only with
      // live summaries, so the final stdout summary must not register new ones.
      reporter._clearSummary()

      reporter._printSummary()

      expect(reporter._clearString).toBe('')
    })
  })

  it('should redraw the cancellation summary on stderr on a terminal', () => {
    withTerminal(() => {
      const { reporter } = makeReporterWithOneCheck(TEST_SESSION_ID)
      printLnMock.mockClear()
      printLnErrMock.mockClear()

      reporter.onCancel()

      // The run is still winding down: the cancel notice is a live redraw, and
      // the final (cancelled) summary arrives later via onEnd on stdout.
      expect(outputOf(printLnErrMock)).toContain('Cancelling checks')
      expect(printLnMock).not.toHaveBeenCalled()
      expect(reporter._clearString).not.toBe('')
    })
  })

  it('should include cancellation message with --detach hint after onCancel', () => {
    withTty(process.stderr, false, () => {
      const { reporter } = makeReporterWithOneCheck(TEST_SESSION_ID)

      reporter.onCancel()

      const summary = outputOf(printLnMock)
      expect(summary).toContain('Cancelling checks')
      expect(summary).toContain('--detach')
      expect(summary).toContain(`Test session ID: ${TEST_SESSION_ID}`)
      expect(summary).toContain(`Inspect session: checkly test-sessions get ${TEST_SESSION_ID} --watch`)
      expect(summary).toContain(`Open session: ${TEST_SESSION_URL}`)
      expect(countOccurrences(summary, `Test session ID: ${TEST_SESSION_ID}`)).toBe(1)
      expect(countOccurrences(summary, `Inspect session: checkly test-sessions get ${TEST_SESSION_ID} --watch`)).toBe(1)
      expect(countOccurrences(summary, `Open session: ${TEST_SESSION_URL}`)).toBe(1)
    })
  })

  it('should include detach message after onDetach', () => {
    const { reporter } = makeReporterWithOneCheck(TEST_SESSION_ID)

    reporter.onDetach()

    const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
    const summary = calls.join('\n')
    expect(summary).toContain('continue running')
    expect(summary).toContain(`Test session ID: ${TEST_SESSION_ID}`)
    expect(summary).toContain(`Inspect session: checkly test-sessions get ${TEST_SESSION_ID} --watch`)
    expect(summary).toContain(`Open session: ${TEST_SESSION_URL}`)
    expect(countOccurrences(summary, `Test session ID: ${TEST_SESSION_ID}`)).toBe(1)
    expect(countOccurrences(summary, `Inspect session: checkly test-sessions get ${TEST_SESSION_ID} --watch`)).toBe(1)
    expect(countOccurrences(summary, `Open session: ${TEST_SESSION_URL}`)).toBe(1)
  })

  it('does not redraw the check list for detached non-TTY output', () => {
    withTty(process.stderr, false, () => {
      const { reporter } = makeReporterWithOneCheck(TEST_SESSION_ID)
      printLnMock.mockClear()
      printLnErrMock.mockClear()
      reporter.onDetach()

      const summary = outputOf(printLnMock)
      expect(countOccurrences(summary, SOURCE_FILE)).toBe(0)
      expect(countOccurrences(summary, 'My API Check')).toBe(0)
      expect(summary).toContain('Checks will continue running in the cloud.')
      expect(summary).toContain('1 scheduling, 1 total')
      expect(summary).not.toContain('\x1B[K')
      expect(printLnErrMock.mock.calls.map(([text]: [string]) => text).join('\n')).not.toContain('\x1B[K')
    })
  })

  it('should send streamed logs to stderr', () => {
    const { reporter, check } = makeReporterWithOneCheck()
    printLnMock.mockClear()
    printLnErrMock.mockClear()

    reporter.onStreamLogs(check, SEQUENCE_ID, [{ timestamp: 0, message: 'hello from the check' }])

    const stderr = outputOf(printLnErrMock)
    const stdout = outputOf(printLnMock)
    expect(stderr).toContain('hello from the check')
    expect(stdout).not.toContain('hello from the check')
  })

  it('should render existing detailed session summary link output', async () => {
    vi.mocked(api.testSessions.getShortLink).mockResolvedValue({
      data: {
        link: 'https://chkly.link/session-summary',
      },
    } as any)
    const { reporter } = makeReporterWithOneCheck(TEST_SESSION_ID)

    await reporter._printTestSessionsUrl()

    const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
    const output = calls.join('\n')
    expect(output).toContain(`Test session ID: ${TEST_SESSION_ID}`)
    expect(output).toContain(`Inspect session: checkly test-sessions get ${TEST_SESSION_ID} --watch`)
    expect(output).toContain(`Open session: ${TEST_SESSION_URL}`)
    expect(output).toContain('Detailed session summary at:')
    expect(output).toContain('https://chkly.link/session-summary')
    expect(countOccurrences(output, `Test session ID: ${TEST_SESSION_ID}`)).toBe(1)
    expect(countOccurrences(output, `Inspect session: checkly test-sessions get ${TEST_SESSION_ID} --watch`)).toBe(1)
    expect(countOccurrences(output, `Open session: ${TEST_SESSION_URL}`)).toBe(1)
  })

  describe('after the run stopped at the max failures limit', () => {
    function makeStoppedReporter (
      reporter = new ListReporter(PUBLIC_RUN_LOCATION, false),
      { unfinishedRetries = 0 } = {},
    ) {
      const failing = { name: 'Failing Check', getSourceFile: () => SOURCE_FILE }
      const unfinished = { name: 'Slow Check', getSourceFile: () => SOURCE_FILE }
      reporter.onBegin([
        { check: failing, sequenceId: 'seq-failing' },
        { check: unfinished, sequenceId: 'seq-slow' },
      ])
      reporter.onCheckInProgress(unfinished, 'seq-slow')
      for (let i = 0; i < unfinishedRetries; i++) {
        reporter.onCheckAttemptResult('seq-slow', { ...makePassingResult(), name: 'Slow Check', hasFailures: true })
      }
      reporter.onCheckEnd('seq-failing', { ...makePassingResult(), name: 'Failing Check', hasFailures: true })
      reporter.onMaxFailuresReached(1)
      printLnMock.mockClear()
      return reporter
    }

    it('shows checks without a result as not finished in the summary', () => {
      withTty(process.stdout, false, () => {
        makeStoppedReporter()._printSummary()

        const summary = printLnMock.mock.calls.map(([text]: [string]) => text).join('\n')
        expect(summary).toContain('… Slow Check')
        expect(summary).toContain('1 failed, 1 not finished, 2 total')
        expect(summary).not.toContain('running')
        expect(summary).toContain('Stopped after 1 failed check (max failures limit).')
      })
    })

    it('keeps the retry count of unfinished checks that already retried', () => {
      withTty(process.stdout, false, () => {
        makeStoppedReporter(undefined, { unfinishedRetries: 1 })._printSummary()

        const summary = printLnMock.mock.calls.map(([text]: [string]) => text).join('\n')
        expect(summary).toContain('… Slow Check (1 retry)')
        expect(summary).toContain('1 failed, 1 not finished, 2 total')
      })
    })

    it('shows checks without a result as not finished in the brief summary', () => {
      makeStoppedReporter()._printBriefSummary()

      const summary = printLnMock.mock.calls.map(([text]: [string]) => text).join('\n')
      expect(summary).toContain('1 failed, 1 not finished, 2 total')
      expect(summary).not.toContain('pending')
      expect(summary).toContain('Stopped after 1 failed check (max failures limit).')
    })

    it('says the ci reporter stopped instead of finishing all checks', () => {
      makeStoppedReporter(new CiReporter(PUBLIC_RUN_LOCATION, false)).onEnd()

      const output = printLnMock.mock.calls.map(([text]: [string]) => text).join('\n')
      expect(output).toContain('Stopped running checks:')
      expect(output).not.toContain('Finished running all checks')
    })
  })
})
