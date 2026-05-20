import { beforeEach, describe, expect, it, vi } from 'vitest'

import ListReporter from '../list.js'
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

function makeReporterWithOneCheck () {
  const reporter = new ListReporter(PUBLIC_RUN_LOCATION, false)
  const check = makeCheck()
  reporter.onBegin([{ check, sequenceId: SEQUENCE_ID }])
  return { reporter, check }
}

describe('AbstractListReporter cancellation lifecycle', () => {
  beforeEach(() => {
    printLnMock.mockClear()
  })

  describe('happy paths', () => {
    it('should call printLn with check status output after onCheckEnd', () => {
      const { reporter, check } = makeReporterWithOneCheck()

      reporter.onCheckInProgress(check, SEQUENCE_ID)
      reporter.onCheckEnd(SEQUENCE_ID, makePassingResult())

      expect(printLnMock).toHaveBeenCalled()
      const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
      expect(calls.some(text => text.includes('My API Check'))).toBe(true)
    })

    it('should populate _clearString after _printSummary runs', () => {
      const { reporter } = makeReporterWithOneCheck()

      reporter._printSummary()

      expect(reporter._clearString).not.toBe('')
    })

    it('should call printLn with the ANSI clear sequence when onCancelPromptShown is called', () => {
      const { reporter } = makeReporterWithOneCheck()
      reporter._printSummary()
      const clearString = reporter._clearString

      printLnMock.mockClear()
      reporter.onCancelPromptShown()

      const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
      expect(calls).toContain(clearString)
    })

    it('should set _clearString to empty string after onCancelPromptShown', () => {
      const { reporter } = makeReporterWithOneCheck()
      reporter._printSummary()

      reporter.onCancelPromptShown()

      expect(reporter._clearString).toBe('')
    })

    it('should call printLn with summary content after onCancelPromptHidden', () => {
      const { reporter } = makeReporterWithOneCheck()
      reporter._printSummary()
      reporter.onCancelPromptShown()

      printLnMock.mockClear()
      reporter.onCancelPromptHidden()

      expect(printLnMock).toHaveBeenCalled()
      const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
      expect(calls.some(text => text.includes('My API Check'))).toBe(true)
    })

    it('should repaint summary after full cancel-then-hidden cycle when new check ends', () => {
      const { reporter } = makeReporterWithOneCheck()
      reporter._printSummary()
      reporter.onCancelPromptShown()
      reporter.onCancelPromptHidden()

      printLnMock.mockClear()
      reporter.onCheckEnd(SEQUENCE_ID, makePassingResult())

      expect(printLnMock).toHaveBeenCalled()
      const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
      expect(calls.some(text => text.includes('My API Check'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should not call printLn when _clearSummary is called with empty _clearString', () => {
      const reporter = new ListReporter(PUBLIC_RUN_LOCATION, false)
      // No _printSummary called — _clearString stays ''

      reporter._clearSummary()

      expect(printLnMock).not.toHaveBeenCalled()
    })

    it('should not call printLn with new summary when _printSummary is called while isCancelling is true', () => {
      const { reporter } = makeReporterWithOneCheck()
      reporter._printSummary()
      reporter.onCancelPromptShown()

      printLnMock.mockClear()
      reporter._printSummary()

      expect(printLnMock).not.toHaveBeenCalled()
    })

    it('should not call printLn with log message when onStreamLogs is called while isCancelling is true', () => {
      const { reporter, check } = makeReporterWithOneCheck()
      reporter.onCancelPromptShown()

      printLnMock.mockClear()
      reporter.onStreamLogs(check, SEQUENCE_ID, [{ timestamp: 0, message: 'test log' }])

      const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
      expect(calls.some(text => text.includes('test log'))).toBe(false)
    })

    it('should call printLn with log message when onStreamLogs is called while isCancelling is false', () => {
      const { reporter, check } = makeReporterWithOneCheck()

      reporter.onStreamLogs(check, SEQUENCE_ID, [{ timestamp: 0, message: 'test log' }])

      const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
      expect(calls.some(text => text.includes('test log'))).toBe(true)
    })

    it('should not throw when onCancelPromptHidden is called without prior onCancelPromptShown', () => {
      const { reporter } = makeReporterWithOneCheck()

      expect(() => reporter.onCancelPromptHidden()).not.toThrow()
    })

    it('should call printLn with summary content when onCancelPromptHidden is called without prior onCancelPromptShown', () => {
      const { reporter } = makeReporterWithOneCheck()

      reporter.onCancelPromptHidden()

      const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
      expect(calls.some(text => text.includes('My API Check'))).toBe(true)
    })

    it('should call printLn for the clear exactly once when onCancelPromptShown is called twice', () => {
      const { reporter } = makeReporterWithOneCheck()
      reporter._printSummary()
      const clearString = reporter._clearString

      reporter.onCancelPromptShown()
      const clearCallsAfterFirst = printLnMock.mock.calls.filter(
        ([text]: [string]) => text === clearString,
      ).length

      printLnMock.mockClear()
      reporter.onCancelPromptShown()

      const clearCallsAfterSecond = printLnMock.mock.calls.filter(
        ([text]: [string]) => text === clearString,
      ).length

      expect(clearCallsAfterFirst).toBe(1)
      expect(clearCallsAfterSecond).toBe(0)
    })

    it('should repaint normally after full cancel-hidden cycle followed by another onCheckEnd', () => {
      const { reporter } = makeReporterWithOneCheck()
      reporter._printSummary()
      reporter.onCancelPromptShown()
      reporter.onCancelPromptHidden()

      printLnMock.mockClear()
      reporter.onCheckEnd(SEQUENCE_ID, makePassingResult())

      expect(printLnMock).toHaveBeenCalled()
    })

    it('should not print summary content during isCancelling when onCheckEnd is called', () => {
      const { reporter } = makeReporterWithOneCheck()
      reporter._printSummary()
      reporter.onCancelPromptShown()

      printLnMock.mockClear()
      reporter.onCheckEnd(SEQUENCE_ID, makePassingResult())

      // Summary content has the check name in counts line or status; _printSummary early-returns
      // so no summary render call happens. Only inline check detail from ListReporter may print.
      // The key assertion: _clearString remains empty (no new summary was written).
      expect(reporter._clearString).toBe('')
    })
  })
})
