import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import GithubReporter from '../github.js'
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

describe('GithubReporter', () => {
  let summaryFile: string

  beforeEach(() => {
    printLnMock.mockClear()
    printLnErrMock.mockClear()
    summaryFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'checkly-github-')), 'summary.md')
    vi.stubEnv('CHECKLY_REPORTER_GITHUB_OUTPUT', summaryFile)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(path.dirname(summaryFile), { recursive: true, force: true })
  })

  it('prints one progress line on stderr for each check as its result arrives', () => {
    const reporter = new GithubReporter(PUBLIC_RUN_LOCATION, false)
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
    const reporter = new GithubReporter(PUBLIC_RUN_LOCATION, false)
    reporter.onBegin([{ check: makeCheck('First check'), sequenceId: 'seq-1' as SequenceId }])
    reporter.onCheckEnd('seq-1' as SequenceId, makeResult('First check'))

    expect(stdoutText()).not.toContain('First check')
  })

  it('prints a progress line for an attempt that will be retried, without counting it as finished', () => {
    const reporter = new GithubReporter(PUBLIC_RUN_LOCATION, false)
    reporter.onBegin([{ check: makeCheck('Flaky check'), sequenceId: 'seq-1' as SequenceId }])
    printLnErrMock.mockClear()

    reporter.onCheckAttemptResult('seq-1', makeResult('Flaky check', { hasFailures: true }))
    reporter.onCheckEnd('seq-1' as SequenceId, makeResult('Flaky check'))

    const lines = stderrLines()
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(`↺ ${SOURCE_FILE} > Flaky check`)
    expect(lines[1]).toContain(`${SOURCE_FILE} > Flaky check [1/1]`)
  })

  it('leaves the source file out for checks without one, as with checkly trigger', () => {
    const reporter = new GithubReporter(PUBLIC_RUN_LOCATION, false)
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

  it('prints no progress lines when printProgress is off', () => {
    const reporter = new GithubReporter(PUBLIC_RUN_LOCATION, false, { printProgress: false })
    reporter.onBegin([{ check: makeCheck('First check'), sequenceId: 'seq-1' as SequenceId }])
    printLnErrMock.mockClear()

    reporter.onCheckAttemptResult('seq-1', makeResult('First check', { hasFailures: true }))
    reporter.onCheckEnd('seq-1' as SequenceId, makeResult('First check'))

    expect(stderrLines()).toEqual([])
  })

  it('still writes the markdown summary with every check at the end', () => {
    const reporter = new GithubReporter(PUBLIC_RUN_LOCATION, false)
    reporter.onBegin([
      { check: makeCheck('First check'), sequenceId: 'seq-1' as SequenceId },
      { check: makeCheck('Second check'), sequenceId: 'seq-2' as SequenceId },
    ])
    reporter.onCheckEnd('seq-1' as SequenceId, makeResult('First check'))
    reporter.onCheckEnd('seq-2' as SequenceId, makeResult('Second check', { hasFailures: true }))
    reporter.onEnd()

    const markdown = fs.readFileSync(summaryFile, 'utf8')
    expect(markdown).toContain('Ran **2** checks in **eu-west-1**.')
    expect(markdown).toContain('|✅ Pass|First check|')
    expect(markdown).toContain('|❌ Fail|Second check|')
  })
})

describe('createReporters', () => {
  function githubProgressLines (types: Parameters<typeof createReporters>[0]) {
    const reporter = createReporters(types, PUBLIC_RUN_LOCATION, false)
      .find(r => r instanceof GithubReporter) as GithubReporter
    reporter.onBegin([{ check: makeCheck('First check'), sequenceId: 'seq-1' as SequenceId }])
    printLnErrMock.mockClear()
    reporter.onCheckEnd('seq-1' as SequenceId, makeResult('First check'))
    return stderrLines()
  }

  beforeEach(() => {
    printLnMock.mockClear()
    printLnErrMock.mockClear()
  })

  it('lets the github reporter print progress when no other reporter prints to the console', () => {
    expect(githubProgressLines(['github'])).toHaveLength(1)
    expect(githubProgressLines(['github', 'json'])).toHaveLength(1)
  })

  it.each(['list', 'dot', 'ci'] as const)('silences github progress next to the %s reporter', other => {
    expect(githubProgressLines([other, 'github'])).toEqual([])
  })
})
