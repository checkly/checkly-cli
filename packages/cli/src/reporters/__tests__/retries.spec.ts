import { beforeEach, describe, expect, it, vi } from 'vitest'

import ListReporter from '../list.js'
import { CheckStatus, formatCheckTitle } from '../util.js'
import { simpleCheckFixture } from './fixtures/simple-check.js'
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

function stripAnsi (input: string): string {
  return input.replace(
    // eslint-disable-next-line no-control-regex
    /[][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

const SOURCE_FILE = 'folder/api.check.ts'
const SEQUENCE_ID: SequenceId = 'seq-001'

function makeResult (hasFailures: boolean) {
  return {
    name: 'My API Check',
    sourceFile: SOURCE_FILE,
    hasFailures,
    isDegraded: false,
    isCancelled: false,
  }
}

function makeReporter () {
  const reporter = new ListReporter({ type: 'PUBLIC', region: 'eu-west-1' }, false)
  const check = { name: 'My API Check', getSourceFile: () => SOURCE_FILE }
  reporter.onBegin([{ check, sequenceId: SEQUENCE_ID }])
  return { reporter, check }
}

function summaryOutput (reporter: ListReporter): string {
  printLnMock.mockClear()
  const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false })
  try {
    reporter._printSummary()
  } finally {
    if (stdoutDescriptor) {
      Object.defineProperty(process.stdout, 'isTTY', stdoutDescriptor)
    } else {
      delete (process.stdout as { isTTY?: boolean }).isTTY
    }
  }
  return stripAnsi(printLnMock.mock.calls.map(([text]: [string]) => text).join('\n'))
}

describe('formatCheckTitle() with retries', () => {
  it('appends the retry count to a terminal title', () => {
    const passed = stripAnsi(formatCheckTitle(CheckStatus.SUCCESSFUL, simpleCheckFixture, { retries: 2 }))
    expect(passed).toContain('Test Check')
    expect(passed).toContain('(2 retries)')
    const failed = stripAnsi(formatCheckTitle(CheckStatus.FAILED, simpleCheckFixture, { retries: 1 }))
    expect(failed).toContain('(1 retry)')
  })

  it('does not append a retry count while retrying or when there were no retries', () => {
    const retrying = stripAnsi(formatCheckTitle(CheckStatus.RETRIED, simpleCheckFixture, { retries: 2 }))
    expect(retrying).not.toContain('retries')
    const clean = stripAnsi(formatCheckTitle(CheckStatus.SUCCESSFUL, simpleCheckFixture, { retries: 0 }))
    expect(clean).not.toContain('retr')
  })
})

describe('ListReporter summary with retries', () => {
  beforeEach(() => {
    printLnMock.mockClear()
  })

  it('shows a check that passed after retries as passed and flaky, with the retry count', () => {
    const { reporter, check } = makeReporter()
    reporter.onCheckInProgress(check, SEQUENCE_ID)
    reporter.onCheckAttemptResult(SEQUENCE_ID, makeResult(true))
    reporter.onCheckAttemptResult(SEQUENCE_ID, makeResult(true))
    reporter.onCheckEnd(SEQUENCE_ID, makeResult(false))

    const output = summaryOutput(reporter)
    expect(output).toContain('My API Check (2 retries)')
    expect(output).toContain('1 passed')
    expect(output).toContain('1 flaky')
    expect(output).not.toContain('failed')
  })

  it('shows a check that failed after retries as failed, not flaky', () => {
    const { reporter, check } = makeReporter()
    reporter.onCheckInProgress(check, SEQUENCE_ID)
    reporter.onCheckAttemptResult(SEQUENCE_ID, makeResult(true))
    reporter.onCheckEnd(SEQUENCE_ID, makeResult(true))

    const output = summaryOutput(reporter)
    expect(output).toContain('My API Check (1 retry)')
    expect(output).toContain('1 failed')
    expect(output).not.toContain('flaky')
  })

  it('does not count a check as flaky when it passed without retries', () => {
    const { reporter, check } = makeReporter()
    reporter.onCheckInProgress(check, SEQUENCE_ID)
    reporter.onCheckEnd(SEQUENCE_ID, makeResult(false))

    const output = summaryOutput(reporter)
    expect(output).toContain('1 passed')
    expect(output).not.toContain('flaky')
    expect(output).not.toContain('retr')
  })
})
