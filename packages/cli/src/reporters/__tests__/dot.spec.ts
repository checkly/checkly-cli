import { beforeEach, describe, expect, it, vi } from 'vitest'

import DotReporter from '../dot.js'
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

function stripAnsi (input: string): string {
  return input.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
}

const PUBLIC_RUN_LOCATION = { type: 'PUBLIC' as const, region: 'eu-west-1' }

const SOURCE_FILE = 'folder/playwright.check.ts'
const SEQUENCE_ID: SequenceId = 'seq-001'
const RUN_ERROR = 'Reached timeout of 240 seconds waiting for check result. Use a custom timeout with --timeout'

function makeCheck (sourceFile = SOURCE_FILE) {
  return {
    name: 'My Playwright Check',
    getSourceFile: () => sourceFile,
  }
}

function makeResult (extra: Record<string, any> = {}, sourceFile = SOURCE_FILE) {
  return {
    name: 'My Playwright Check',
    sourceFile,
    hasFailures: false,
    isDegraded: false,
    isCancelled: false,
    ...extra,
  }
}

function makeReporterWithOneCheck () {
  const reporter = new DotReporter(PUBLIC_RUN_LOCATION, false)
  const check = makeCheck()
  reporter.onBegin([{ check, sequenceId: SEQUENCE_ID }])
  return { reporter, check }
}

// The per-check marks: stderr writes without a line break.
function marks () {
  return stripAnsi(printLnErrMock.mock.calls
    .filter(([, afterLnCount]: [string, number?]) => afterLnCount === 0)
    .map(([text]: [string]) => text).join(''))
}

function printedOutput () {
  return stripAnsi(printLnMock.mock.calls.map(([text]: [string]) => text).join('\n'))
}

describe('DotReporter', () => {
  beforeEach(() => {
    printLnMock.mockClear()
    printLnErrMock.mockClear()
  })

  it('prints the run announcement on stderr and results on stdout', () => {
    const { reporter } = makeReporterWithOneCheck()
    reporter.onCheckEnd(SEQUENCE_ID, makeResult())
    reporter.onEnd()

    const dots = marks()
    expect(dots).toContain('.')
    expect(stripAnsi(printLnErrMock.mock.calls.map(([text]: [string]) => text).join('\n')))
      .toContain(`Running 1 checks in ${PUBLIC_RUN_LOCATION.region}`)
    expect(printedOutput()).not.toContain('Running 1 checks')
  })

  it('ends the line of marks on stderr and opens the summary without an extra empty line', () => {
    const { reporter } = makeReporterWithOneCheck()
    reporter.onCheckEnd(SEQUENCE_ID, makeResult())
    printLnErrMock.mockClear()
    reporter.onEnd()

    expect(printLnErrMock).toHaveBeenCalledWith('')
    expect(printedOutput().startsWith('1 passed')).toBe(true)
  })

  it('should print execution error details for a check that failed with a run error', () => {
    const { reporter } = makeReporterWithOneCheck()

    reporter.onCheckEnd(SEQUENCE_ID, makeResult({ hasFailures: true, runError: RUN_ERROR }))
    reporter.onEnd()

    const dots = marks()
    expect(dots).toContain('F')
    const output = printedOutput()
    expect(output).toContain('Execution Error')
    expect(output).toContain(RUN_ERROR)
    expect(output).toContain('My Playwright Check')
  })

  it('should not print execution error details for a passing check', () => {
    const { reporter } = makeReporterWithOneCheck()

    reporter.onCheckEnd(SEQUENCE_ID, makeResult())
    reporter.onEnd()

    const dots = marks()
    expect(dots).toContain('.')
    expect(printedOutput()).not.toContain('Execution Error')
  })

  it('should not print execution error details for a check that failed without a run error', () => {
    const { reporter } = makeReporterWithOneCheck()

    reporter.onCheckEnd(SEQUENCE_ID, makeResult({ hasFailures: true }))
    reporter.onEnd()

    const dots = marks()
    expect(dots).toContain('F')
    expect(printedOutput()).not.toContain('Execution Error')
  })
})
