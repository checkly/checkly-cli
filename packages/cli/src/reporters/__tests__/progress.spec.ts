import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AbstractProgressReporter from '../abstract-progress.js'
import GithubReporter from '../github.js'
import JsonReporter from '../json.js'
import { createReporters } from '../reporter.js'
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
const SOURCE_FILE = 'folder/api.check.ts'

function makeCheck (name: string, sourceFile = SOURCE_FILE) {
  return { name, getSourceFile: () => sourceFile }
}

function makeResult (name: string, extra: Record<string, any> = {}, sourceFile: string | undefined = SOURCE_FILE) {
  return {
    name,
    sourceFile,
    checkType: 'API',
    responseTime: 120,
    hasFailures: false,
    isDegraded: false,
    isCancelled: false,
    ...extra,
  }
}

function stderrLines () {
  return printLnErrMock.mock.calls.map(([text]: [string]) => stripAnsi(text))
}

function stdoutText () {
  return stripAnsi(printLnMock.mock.calls.map(([text]: [string]) => text).join('\n'))
}

// Both file reporters write their report to a temporary file instead of the
// working directory.
let reportDir: string

beforeEach(() => {
  printLnMock.mockClear()
  printLnErrMock.mockClear()
  reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkly-progress-'))
  vi.stubEnv('CHECKLY_REPORTER_GITHUB_OUTPUT', path.join(reportDir, 'summary.md'))
  vi.stubEnv('CHECKLY_REPORTER_JSON_OUTPUT', path.join(reportDir, 'report.json'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(reportDir, { recursive: true, force: true })
})

describe.each([
  ['GithubReporter', GithubReporter],
  ['JsonReporter', JsonReporter],
] as const)('%s progress', (_name, Reporter) => {
  it('prints one progress line on stderr for each check as its result arrives', () => {
    const reporter = new Reporter(PUBLIC_RUN_LOCATION, false)
    reporter.onBegin([
      { check: makeCheck('First check'), sequenceId: 'seq-1' as SequenceId },
      { check: makeCheck('Second check'), sequenceId: 'seq-2' as SequenceId },
    ])
    printLnErrMock.mockClear()

    reporter.onCheckEnd('seq-2' as SequenceId, makeResult('Second check'))
    expect(stderrLines()).toHaveLength(1)
    expect(stderrLines()[0]).toContain(`${SOURCE_FILE} > Second check [1/2]`)

    reporter.onCheckEnd('seq-1' as SequenceId, makeResult('First check', { hasFailures: true }))
    expect(stderrLines()).toHaveLength(2)
    expect(stderrLines()[1]).toContain(`${SOURCE_FILE} > First check [2/2]`)
  })

  it('keeps the progress lines off stdout', () => {
    const reporter = new Reporter(PUBLIC_RUN_LOCATION, false)
    reporter.onBegin([{ check: makeCheck('First check'), sequenceId: 'seq-1' as SequenceId }])
    reporter.onCheckEnd('seq-1' as SequenceId, makeResult('First check'))

    expect(stdoutText()).not.toContain('First check')
  })

  it('prints a progress line for an attempt that will be retried, without counting it as finished', () => {
    const reporter = new Reporter(PUBLIC_RUN_LOCATION, false)
    reporter.onBegin([{ check: makeCheck('Flaky check'), sequenceId: 'seq-1' as SequenceId }])
    printLnErrMock.mockClear()

    reporter.onCheckAttemptResult('seq-1', makeResult('Flaky check', { hasFailures: true }))
    reporter.onCheckEnd('seq-1' as SequenceId, makeResult('Flaky check'))

    const lines = stderrLines()
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(`↺ ${SOURCE_FILE} > Flaky check`)
    expect(lines[1]).toContain(`${SOURCE_FILE} > Flaky check`)
    expect(lines[1]).toMatch(/\(1 retry\) \[1\/1\]$/)
  })

  it('leaves the source file out for checks without one, as with checkly trigger', () => {
    const reporter = new Reporter(PUBLIC_RUN_LOCATION, false)
    const check = { name: 'Deployed check', getSourceFile: () => undefined }
    reporter.onBegin([{ check, sequenceId: 'seq-1' as SequenceId }])
    printLnErrMock.mockClear()

    reporter.onCheckEnd('seq-1' as SequenceId, { ...makeResult('Deployed check'), sourceFile: undefined })

    const lines = stderrLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('Deployed check [1/1]')
    expect(lines[0]).not.toContain('undefined')
    expect(lines[0]).not.toContain('>')
  })

  it('prints a progress line above a live summary and draws the summary again', () => {
    const reporter = new Reporter(PUBLIC_RUN_LOCATION, false)
    reporter.onBegin([{ check: makeCheck('First check'), sequenceId: 'seq-1' as SequenceId }])
    // A live summary is on screen when streamed logs drew one in a terminal.
    reporter._clearString = '<clear summary>'
    const printSummary = vi.spyOn(reporter, '_printSummary').mockImplementation(() => {
      printLnErrMock('<summary>')
    })
    printLnErrMock.mockClear()

    reporter.onCheckEnd('seq-1' as SequenceId, makeResult('First check'))

    const lines = stderrLines()
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('<clear summary>')
    expect(lines[1]).toContain(`${SOURCE_FILE} > First check [1/1]`)
    expect(lines[2]).toBe('<summary>')
    expect(printSummary).toHaveBeenCalledWith({ stream: 'stderr' })
  })

  it('prints neither the header nor progress lines when printProgress is off', () => {
    const reporter = new Reporter(PUBLIC_RUN_LOCATION, false, { printProgress: false })
    reporter.onBegin([{ check: makeCheck('First check'), sequenceId: 'seq-1' as SequenceId }])

    reporter.onCheckAttemptResult('seq-1', makeResult('First check', { hasFailures: true }))
    reporter.onCheckEnd('seq-1' as SequenceId, makeResult('First check'))

    expect(stderrLines()).toEqual([])
  })
})

describe('report files', () => {
  function runTwoChecks (reporter: AbstractProgressReporter) {
    reporter.onBegin([
      { check: makeCheck('First check'), sequenceId: 'seq-1' as SequenceId },
      { check: makeCheck('Second check'), sequenceId: 'seq-2' as SequenceId },
    ])
    reporter.onCheckEnd('seq-1' as SequenceId, makeResult('First check'))
    reporter.onCheckEnd('seq-2' as SequenceId, makeResult('Second check', { hasFailures: true }))
    reporter.onEnd()
  }

  it('the github reporter still writes the markdown summary with every check', () => {
    runTwoChecks(new GithubReporter(PUBLIC_RUN_LOCATION, false))

    const markdown = fs.readFileSync(path.join(reportDir, 'summary.md'), 'utf8')
    expect(markdown).toContain('Ran **2** checks in **eu-west-1**.')
    expect(markdown).toContain('|✅ Pass|First check|')
    expect(markdown).toContain('|❌ Fail|Second check|')
  })

  it('the json reporter still writes the JSON report with every check', () => {
    runTwoChecks(new JsonReporter(PUBLIC_RUN_LOCATION, false))

    const report = JSON.parse(fs.readFileSync(path.join(reportDir, 'report.json'), 'utf8'))
    expect(report.checks.map((check: any) => [check.name, check.result])).toEqual([
      ['First check', 'Pass'],
      ['Second check', 'Fail'],
    ])
  })
})

describe('createReporters', () => {
  // Drives every reporter createReporters returns and reports which ones
  // printed a progress line, by their position in `types`.
  function progressPrinters (types: Parameters<typeof createReporters>[0]) {
    const reporters = createReporters(types, PUBLIC_RUN_LOCATION, false)
    const printers: number[] = []
    reporters.forEach((reporter, index) => {
      reporter.onBegin([{ check: makeCheck('First check'), sequenceId: 'seq-1' as SequenceId }])
      printLnErrMock.mockClear()
      reporter.onCheckEnd('seq-1' as SequenceId, makeResult('First check'))
      if (stderrLines().some(line => line.endsWith('[1/1]'))) {
        printers.push(index)
      }
    })
    return printers
  }

  it.each([
    [['github']],
    [['json']],
  ] as const)('lets %j print progress on its own', types => {
    expect(progressPrinters([...types])).toEqual([0])
  })

  it.each([
    [['github', 'json']],
    [['json', 'github']],
    [['github', 'github']],
    [['json', 'json']],
  ] as const)('lets only the first reporter of %j print progress', types => {
    expect(progressPrinters([...types])).toEqual([0])
  })

  it.each([
    [['list', 'json']],
    [['ci', 'github', 'json']],
    [['github', 'json']],
    [['json', 'json']],
  ] as const)('prints the "Running N checks" header once for %j', types => {
    for (const reporter of createReporters([...types], PUBLIC_RUN_LOCATION, false)) {
      reporter.onBegin([{ check: makeCheck('First check'), sequenceId: 'seq-1' as SequenceId }])
    }
    expect(stderrLines().filter(line => line.startsWith('Running 1 checks'))).toHaveLength(1)
  })

  it.each(['list', 'dot', 'ci'] as const)('silences github and json progress next to the %s reporter', other => {
    const types = [other, 'github', 'json'] as const
    expect(progressPrinters([...types]).filter(index => types[index] !== other)).toEqual([])
  })
})
