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

describe('AbstractListReporter', () => {
  beforeEach(() => {
    printLnMock.mockClear()
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
    const { reporter } = makeReporterWithOneCheck()

    reporter._printSummary()

    expect(reporter._clearString).not.toBe('')
  })

  it('should include cancellation message with --detach hint after onCancel', () => {
    const { reporter } = makeReporterWithOneCheck()

    reporter.onCancel()

    const calls = printLnMock.mock.calls.map(([text]: [string]) => text)
    const summary = calls.join('\n')
    expect(summary).toContain('Cancelling checks')
    expect(summary).toContain('--detach')
  })
})
