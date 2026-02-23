import { describe, it, expect } from 'vitest'
import { buildActiveCheckIds } from '../list'
import type { Check } from '../../../rest/checks'
import type { CheckGroup } from '../../../rest/check-groups'

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
