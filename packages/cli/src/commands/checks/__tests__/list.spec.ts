import { describe, it, expect } from 'vitest'
import { buildActiveCheckIds, filterByStatus } from '../list'
import type { Check } from '../../../rest/checks'
import type { CheckStatus } from '../../../rest/check-statuses'
import type { CheckGroup } from '../../../rest/check-groups'
import type { CheckWithStatus } from '../../../formatters/checks'

function makeCheck (overrides: Partial<Check> = {}): Check {
  return {
    id: 'check-1',
    name: 'Test Check',
    checkType: 'API',
    activated: true,
    muted: false,
    frequency: 10,
    locations: ['eu-west-1'],
    tags: [],
    groupId: null,
    groupOrder: null,
    runtimeId: null,
    scriptPath: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: null,
    ...overrides,
  }
}

function makeGroup (overrides: Partial<CheckGroup> = {}): CheckGroup {
  return {
    id: 1,
    name: 'Group 1',
    activated: true,
    muted: false,
    locations: [],
    tags: [],
    concurrency: 1,
    ...overrides,
  }
}

const baseStatus: CheckStatus = {
  name: 'Test',
  checkId: 'check-1',
  hasFailures: false,
  hasErrors: false,
  isDegraded: false,
  longestRun: 100,
  shortestRun: 50,
  lastRunLocation: 'eu-west-1',
  lastCheckRunId: 'run-1',
  sslDaysRemaining: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: null,
}

function makeCheckWithStatus (overrides: Partial<Check> = {}, statusOverrides?: Partial<CheckStatus>): CheckWithStatus {
  return {
    ...makeCheck(overrides),
    status: statusOverrides !== undefined ? { ...baseStatus, ...statusOverrides } : undefined,
  }
}

describe('filterByStatus', () => {
  it('excludes inactive checks when filtering for failing', () => {
    const checks = [
      makeCheckWithStatus({ id: 'c1', activated: false }, { hasFailures: true }),
      makeCheckWithStatus({ id: 'c2', activated: true }, { hasFailures: true }),
    ]
    const result = filterByStatus(checks, 'failing')
    expect(result.map(c => c.id)).toEqual(['c2'])
  })

  it('excludes inactive checks when filtering for passing', () => {
    const checks = [
      makeCheckWithStatus({ id: 'c1', activated: false }, {}),
      makeCheckWithStatus({ id: 'c2', activated: true }, {}),
    ]
    const result = filterByStatus(checks, 'passing')
    expect(result.map(c => c.id)).toEqual(['c2'])
  })

  it('includes checks with errors when filtering for failing', () => {
    const checks = [
      makeCheckWithStatus({ id: 'c1' }, { hasErrors: true }),
      makeCheckWithStatus({ id: 'c2' }, { hasFailures: true }),
      makeCheckWithStatus({ id: 'c3' }, {}),
    ]
    const result = filterByStatus(checks, 'failing')
    expect(result.map(c => c.id)).toEqual(['c1', 'c2'])
  })

  it('filters for degraded status', () => {
    const checks = [
      makeCheckWithStatus({ id: 'c1' }, { isDegraded: true }),
      makeCheckWithStatus({ id: 'c2' }, {}),
    ]
    const result = filterByStatus(checks, 'degraded')
    expect(result.map(c => c.id)).toEqual(['c1'])
  })

  it('filters for passing status', () => {
    const checks = [
      makeCheckWithStatus({ id: 'c1' }, {}),
      makeCheckWithStatus({ id: 'c2' }, { hasFailures: true }),
      makeCheckWithStatus({ id: 'c3' }, { isDegraded: true }),
    ]
    const result = filterByStatus(checks, 'passing')
    expect(result.map(c => c.id)).toEqual(['c1'])
  })

  it('excludes checks without status data', () => {
    const checks = [
      makeCheckWithStatus({ id: 'c1' }),
      makeCheckWithStatus({ id: 'c2' }, { hasFailures: true }),
    ]
    const result = filterByStatus(checks, 'failing')
    expect(result.map(c => c.id)).toEqual(['c2'])
  })
})

describe('buildActiveCheckIds', () => {
  it('includes activated non-heartbeat checks', () => {
    const checks = [
      makeCheck({ id: 'c1', checkType: 'API', activated: true }),
      makeCheck({ id: 'c2', checkType: 'BROWSER', activated: true }),
    ]
    const result = buildActiveCheckIds(checks, [])
    expect(result.has('c1')).toBe(true)
    expect(result.has('c2')).toBe(true)
    expect(result.size).toBe(2)
  })

  it('excludes deactivated checks', () => {
    const checks = [
      makeCheck({ id: 'c1', activated: true }),
      makeCheck({ id: 'c2', activated: false }),
    ]
    const result = buildActiveCheckIds(checks, [])
    expect(result.has('c1')).toBe(true)
    expect(result.has('c2')).toBe(false)
  })

  it('excludes heartbeat checks', () => {
    const checks = [
      makeCheck({ id: 'c1', checkType: 'API' }),
      makeCheck({ id: 'c2', checkType: 'HEARTBEAT' }),
    ]
    const result = buildActiveCheckIds(checks, [])
    expect(result.has('c1')).toBe(true)
    expect(result.has('c2')).toBe(false)
  })

  it('excludes checks in deactivated groups', () => {
    const checks = [
      makeCheck({ id: 'c1', groupId: 1 }),
      makeCheck({ id: 'c2', groupId: 2 }),
      makeCheck({ id: 'c3', groupId: null }),
    ]
    const groups = [
      makeGroup({ id: 1, activated: true }),
      makeGroup({ id: 2, activated: false }),
    ]
    const result = buildActiveCheckIds(checks, groups)
    expect(result.has('c1')).toBe(true)
    expect(result.has('c2')).toBe(false)
    expect(result.has('c3')).toBe(true)
  })

  it('returns empty set when no checks match', () => {
    const checks = [
      makeCheck({ id: 'c1', activated: false }),
      makeCheck({ id: 'c2', checkType: 'HEARTBEAT' }),
    ]
    const result = buildActiveCheckIds(checks, [])
    expect(result.size).toBe(0)
  })

  it('handles empty inputs', () => {
    const result = buildActiveCheckIds([], [])
    expect(result.size).toBe(0)
  })
})
