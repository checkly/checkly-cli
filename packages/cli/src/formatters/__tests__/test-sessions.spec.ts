import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stripAnsi } from '../render.js'
import { formatTestSessionDetail, formatTestSessionErrorGroupDetail } from '../test-sessions.js'
import type { TestSessionErrorGroup } from '../../rest/test-session-error-groups.js'
import type { TestSessionDetail, TestSessionStatus } from '../../rest/test-sessions.js'

const testSession: TestSessionDetail = {
  testSessionId: '8166fa86-c9b4-4162-8541-d380c6c212d8',
  testSessionLink: 'https://app.checklyhq.com/accounts/account-id/test-sessions/8166fa86-c9b4-4162-8541-d380c6c212d8',
  name: 'Production smoke test',
  status: 'FAILED',
  startedAt: '2026-05-20T08:00:00.000Z',
  stoppedAt: '2026-05-20T08:02:03.456Z',
  timeElapsed: 123456,
  metadata: {
    environment: 'production',
    repoUrl: 'https://github.com/checkly/checkly-cli',
    branchName: 'main',
    commitId: 'abc123',
  },
  errorGroupIds: ['session-eg-1'],
  results: [
    {
      testSessionResultId: '42406a0f-5864-4a26-9884-7c5d1be15bc2',
      testSessionResultLink: 'https://app.checklyhq.com/accounts/account-id/test-sessions/session-id/results/result-id',
      checkId: 'a4cd4ad9-4815-4a9e-92d2-0a7c562ee69a',
      checkType: 'BROWSER',
      name: 'Homepage',
      runLocation: 'us-east-1',
      resultType: 'FINAL',
      status: 'FAILED',
      hasErrors: false,
      hasFailures: true,
      isDegraded: false,
      aborted: false,
      errorGroupIds: ['result-eg-1'],
    },
  ],
}

const testSessionErrorGroup: TestSessionErrorGroup = {
  id: 'result-eg-1',
  projectId: 'project-1',
  environments: ['production'],
  errorHash: 'hash-1',
  rawErrorMessage: 'Error: boom with raw context',
  cleanedErrorMessage: 'Error: boom',
  firstSeen: '2026-05-20T08:00:00.000Z',
  lastSeen: '2026-05-20T08:02:03.456Z',
  archivedUntilNextEvent: false,
}

describe('formatTestSessionDetail', () => {
  const originalColumns = process.stdout.columns

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-05-20T08:05:00.000Z'))
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 120 })
  })

  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: originalColumns })
  })

  it('renders terminal session summary, results, and hints', () => {
    const result = stripAnsi(formatTestSessionDetail(testSession, 'terminal'))

    expect(result).toContain('Production smoke test')
    expect(result).toContain('Status:')
    expect(result).toContain('failed')
    expect(result).toContain('Started:')
    expect(result).toContain('2026-05-20 08:00:00 UTC')
    expect(result).toContain('Time elapsed:')
    expect(result).toContain('2m 3s')
    expect(result).toContain('environment: production')
    expect(result).not.toContain('Session link:')
    expect(result).toContain('Error groups:')
    expect(result).toContain('2 groups')
    expect(result).toContain('RESULTS')
    expect(result).toContain('NAME')
    expect(result).toContain('RESULT ID')
    expect(result).toContain('42406a0f-5864-4a26-9884-7c5d1be15bc2')
    expect(result).toContain('Homepage')
    expect(result).toContain('BROWSER')
    expect(result).toContain('FINAL')
    expect(result).toContain('us-east-1')
    expect(result).toContain('ERROR GROUP IDS')
    expect(result).toContain('session-eg-1')
    expect(result).toContain('result-eg-1')
    expect(result).toContain('checkly test-sessions get 8166fa86-c9b4-4162-8541-d380c6c212d8 --error-group <error-group-id>')
    expect(result).toContain('checkly rca run --test-session-error-group <error-group-id> --watch')
    expect(result).not.toContain('checkly rca run --test-session-error-group session-eg-1 --watch')
    expect(result).toContain('Open session:')
  })

  it.each<TestSessionStatus>([
    'FAILED',
    'CANCELLED',
    'RUNNING',
    'PASSED',
  ])('renders the supported %s status', status => {
    const result = stripAnsi(formatTestSessionDetail({
      ...testSession,
      status,
      results: [{ ...testSession.results[0], status }],
    }, 'terminal'))

    expect(result).toMatch(new RegExp(`Status:\\s+${status.toLowerCase()}`))
  })

  it('keeps long terminal result rows readable by putting IDs at the end', () => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 180 })

    const result = stripAnsi(formatTestSessionDetail({
      ...testSession,
      results: [
        {
          ...testSession.results[0],
          name: 'Smoke Lab Playwright Suite',
          checkType: 'PLAYWRIGHT',
          errorGroupIds: ['b397fd08-871e-4d45-b307-529778de260c'],
        },
        {
          ...testSession.results[0],
          testSessionResultId: '019e45e0-2177-4640-9b04-2d4f6f9ad55f',
          checkId: null,
          name: 'Smoke Lab Go Runner URL Failure',
          checkType: 'URL',
          errorGroupIds: ['f201a4f5-0cad-4a3c-ab70-e52149b294b1', '094ca569-f746-4d81-a38d-1d5fdd37f42a'],
        },
      ],
    }, 'terminal'))

    const header = result.split('\n').find(line => line.includes('RESULT ID'))!
    const firstRow = result.split('\n').find(line => line.includes('Smoke Lab Playwright'))!
    const secondRow = result.split('\n').find(line => line.includes('Smoke Lab Go Runner'))!

    expect(header.indexOf('RESULT ID')).toBeGreaterThan(header.indexOf('ERROR GROUPS'))
    expect(header.indexOf('CHECK ID')).toBeGreaterThan(header.indexOf('RESULT ID'))
    expect(firstRow.indexOf('42406a0f-5864-4a26-9884-7c5d1be15bc2')).toBeGreaterThan(firstRow.indexOf('1 group'))
    expect(secondRow).toContain('2 groups')
    expect(secondRow).toContain('019e45e0-2177-4640-9b04-2d4f6f9ad55f')
    expect(secondRow).not.toContain('f201a4f5-0cad-4a3c-ab70-e52149b294b1')
  })

  it('limits terminal error group IDs and shows how to expand them', () => {
    const result = stripAnsi(formatTestSessionDetail({
      ...testSession,
      errorGroupIds: ['session-eg-1', 'session-eg-2'],
      results: [
        {
          ...testSession.results[0],
          errorGroupIds: ['result-eg-1', 'result-eg-2'],
        },
      ],
    }, 'terminal', { errorGroupsLimit: 2 }))

    expect(result).toContain('ERROR GROUP IDS')
    expect(result).toContain('session-eg-1')
    expect(result).toContain('session-eg-2')
    expect(result).not.toContain('result-eg-1')
    expect(result).toContain('Showing 2 of 4 error group IDs')
    expect(result).toContain('--error-groups-limit 4')
  })

  it('renders markdown session summary, results table, and RCA hints', () => {
    const result = formatTestSessionDetail(testSession, 'md')

    expect(result).toContain('# Production smoke test')
    expect(result).toContain('| Field | Value |')
    expect(result).toContain('| Error groups | 2 groups |')
    expect(result).toContain('## Results')
    expect(result).toContain('| Result ID | Check ID | Name | Check Type | Status | Result Type | Run Location | Error Groups |')
    expect(result).toContain('| 42406a0f-5864-4a26-9884-7c5d1be15bc2 | a4cd4ad9-4815-4a9e-92d2-0a7c562ee69a | Homepage | BROWSER | failed | FINAL | us-east-1 | result-eg-1 |')
    expect(result).toContain('## Error Group IDs')
    expect(result).toContain('| session | session-eg-1 |')
    expect(result).toContain('| Homepage | result-eg-1 |')
    expect(result).toContain('## Hints')
    expect(result).toContain('- Inspect group: `checkly test-sessions get 8166fa86-c9b4-4162-8541-d380c6c212d8 --error-group <error-group-id>`')
    expect(result).toContain('- Run RCA: `checkly rca run --test-session-error-group <error-group-id> --watch`')
    expect(result).toContain('- Open session: https://app.checklyhq.com/accounts/account-id/test-sessions/8166fa86-c9b4-4162-8541-d380c6c212d8')
  })

  it('omits metadata and RCA hints when absent but keeps the session link hint', () => {
    const result = stripAnsi(formatTestSessionDetail({
      ...testSession,
      metadata: undefined,
      errorGroupIds: [],
      results: [{ ...testSession.results[0], errorGroupIds: [] }],
    }, 'terminal'))

    expect(result).not.toContain('Metadata:')
    expect(result).not.toContain('Run RCA:')
    expect(result).not.toContain('ERROR GROUP IDS')
    expect(result).toContain('Open session:')
  })

  it('renders hydrated test session error group detail', () => {
    const result = stripAnsi(formatTestSessionErrorGroupDetail(testSessionErrorGroup, 'terminal'))

    expect(result).toContain('Test session error group')
    expect(result).toContain('Error:')
    expect(result).toContain('Error: boom with raw context')
    expect(result).not.toContain('Raw error:')
    expect(result).not.toContain('Error: boom\n')
    expect(result).toContain('First seen:')
    expect(result).toContain('2026-05-20 08:00:00 UTC')
    expect(result).toContain('ID:')
    expect(result).toContain('result-eg-1')
  })

  it('limits long hydrated test session error group details by line count', () => {
    const result = stripAnsi(formatTestSessionErrorGroupDetail({
      ...testSessionErrorGroup,
      rawErrorMessage: ['line 1', 'line 2', 'line 3'].join('\n'),
    }, 'terminal', { errorLines: 2 }))

    expect(result).toContain('line 1')
    expect(result).toContain('line 2')
    expect(result).not.toContain('line 3')
    expect(result).toContain('Showing first 2 of 3 lines. Use --full-error to print the complete raw error.')
  })

  it('renders full hydrated test session error group details when requested', () => {
    const result = stripAnsi(formatTestSessionErrorGroupDetail({
      ...testSessionErrorGroup,
      rawErrorMessage: ['line 1', 'line 2', 'line 3'].join('\n'),
    }, 'terminal', { errorLines: 2, fullError: true }))

    expect(result).toContain('line 1')
    expect(result).toContain('line 2')
    expect(result).toContain('line 3')
    expect(result).not.toContain('Use --full-error')
  })

  it('handles absent results from the API contract', () => {
    const result = stripAnsi(formatTestSessionDetail({
      ...testSession,
      results: undefined,
    }, 'terminal'))

    expect(result).toContain('Production smoke test')
    expect(result).not.toContain('RESULTS')
    expect(result).toContain('Open session:')
  })
})
