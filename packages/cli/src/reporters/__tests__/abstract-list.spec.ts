import { beforeEach, describe, expect, it, vi } from 'vitest'

import ListReporter from '../list.js'
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

vi.mock('../util.js', async () => {
  const actual = await vi.importActual<typeof import('../util.js')>('../util.js')
  return {
    ...actual,
    printLn: (...args: Parameters<typeof actual.printLn>) => printLnMock(...args),
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

function withStdoutTty<T> (isTTY: boolean, callback: () => T): T {
  const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: isTTY })

  try {
    return callback()
  } finally {
    if (stdoutDescriptor) {
      Object.defineProperty(process.stdout, 'isTTY', stdoutDescriptor)
    } else {
      delete (process.stdout as { isTTY?: boolean }).isTTY
    }
  }
}

describe('AbstractListReporter', () => {
  beforeEach(() => {
    printLnMock.mockClear()
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

  it('should call printLn with check status output after onCheckEnd', () => {
    const { reporter, check } = makeReporterWithOneCheck()

    reporter.onCheckInProgress(check, SEQUENCE_ID)
    reporter.onCheckEnd(SEQUENCE_ID, makePassingResult())

    expect(printLnMock).toHaveBeenCalled()
    const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
    expect(calls.some(text => text.includes('My API Check'))).toBe(true)
  })

  it('should populate _clearString after _printSummary runs', () => {
    withStdoutTty(true, () => {
      const { reporter } = makeReporterWithOneCheck()

      reporter._printSummary()

      expect(reporter._clearString).not.toBe('')
    })
  })

  it('should include cancellation message with --detach hint after onCancel', () => {
    const { reporter } = makeReporterWithOneCheck(TEST_SESSION_ID)

    reporter.onCancel()

    const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
    const summary = calls.join('\n')
    expect(summary).toContain('Cancelling checks')
    expect(summary).toContain('--detach')
    expect(summary).toContain(`Test session ID: ${TEST_SESSION_ID}`)
    expect(summary).toContain(`Inspect session: checkly test-sessions get ${TEST_SESSION_ID} --watch`)
    expect(summary).toContain(`Open session: ${TEST_SESSION_URL}`)
    expect(countOccurrences(summary, `Test session ID: ${TEST_SESSION_ID}`)).toBe(1)
    expect(countOccurrences(summary, `Inspect session: checkly test-sessions get ${TEST_SESSION_ID} --watch`)).toBe(1)
    expect(countOccurrences(summary, `Open session: ${TEST_SESSION_URL}`)).toBe(1)
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
    withStdoutTty(false, () => {
      const { reporter } = makeReporterWithOneCheck(TEST_SESSION_ID)
      reporter.onDetach()

      const summary = printLnMock.mock.calls.map(([text]: [string]) => text).join('\n')
      expect(countOccurrences(summary, SOURCE_FILE)).toBe(1)
      expect(countOccurrences(summary, 'My API Check')).toBe(1)
      expect(summary).toContain('Checks will continue running in the cloud.')
      expect(summary).toContain('1 scheduling, 1 total')
      expect(summary).not.toContain('\x1B[K')
    })
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
})
