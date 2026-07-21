import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { formatCheckSessionsRun } from '../check-sessions.js'
import { stripAnsi } from '../render.js'
import type { CheckSession } from '../../rest/check-sessions.js'

const sessions: CheckSession[] = [
  {
    checkSessionId: '8166fa86-c9b4-4162-8541-d380c6c212d8',
    checkSessionLink: 'https://app.checklyhq.com/check-sessions/8166fa86-c9b4-4162-8541-d380c6c212d8',
    checkId: 'a4cd4ad9-4815-4a9e-92d2-0a7c562ee69a',
    checkType: 'API',
    name: 'Production API',
    status: 'PASSED',
    startedAt: '2026-07-21T12:00:00.000Z',
    stoppedAt: '2026-07-21T12:00:01.000Z',
    timeElapsed: 1_000,
    runLocations: ['us-east-1'],
    runSource: 'TRIGGER_API',
  },
  {
    checkSessionId: '16e22c0d-22a5-4d03-93c5-91bc38ac3c85',
    checkSessionLink: 'https://app.checklyhq.com/check-sessions/16e22c0d-22a5-4d03-93c5-91bc38ac3c85',
    checkId: '22336fd1-c407-4bf7-a793-91c2246fd08f',
    checkType: 'PLAYWRIGHT',
    name: 'Checkout journey',
    status: 'FAILED',
    startedAt: '2026-07-21T12:00:00.000Z',
    stoppedAt: '2026-07-21T12:02:03.000Z',
    timeElapsed: 123_000,
    runLocations: ['eu-west-1', 'us-east-1'],
    runSource: 'TRIGGER_API',
  },
]

describe('formatCheckSessionsRun', () => {
  const originalColumns = process.stdout.columns

  beforeEach(() => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 180 })
  })

  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: originalColumns })
  })

  it('renders a readable terminal summary, table, and navigation hints', () => {
    const output = stripAnsi(formatCheckSessionsRun(sessions, 'terminal', { detached: false }))

    expect(output).toContain('2 check sessions completed: 1 passed, 1 failed.')
    expect(output).toContain('Configured alerting rules apply to these check runs.')
    expect(output).toContain('STATUS')
    expect(output).toContain('NAME')
    expect(output).toContain('LOCATIONS')
    expect(output).toContain('CHECK ID')
    expect(output).toContain('SESSION ID')
    expect(output).toContain('Production API')
    expect(output).toContain('Checkout journey')
    expect(output).toContain('2m 3s')
    expect(output).toContain('checkly checks get <check-id>')
    expect(output).toContain(sessions[0].checkSessionLink)
  })

  it('describes detached sessions as started', () => {
    const output = stripAnsi(formatCheckSessionsRun([
      { ...sessions[0], status: 'PROGRESS', stoppedAt: null, timeElapsed: 0 },
    ], 'terminal', { detached: true }))

    expect(output).toContain('1 check session started.')
    expect(output).toContain('progress')
    expect(output).not.toContain('completed:')
  })

  it('renders session links in markdown output', () => {
    const output = formatCheckSessionsRun(sessions, 'md', { detached: false })

    expect(output).toContain('# Check sessions')
    expect(output).toContain('| Status | Name | Type | Locations | Duration | Check ID | Session ID |')
    expect(output).toContain(`[${sessions[0].checkSessionId}](${sessions[0].checkSessionLink})`)
    expect(output).toContain('> Configured alerting rules apply to these check runs.')
  })
})
