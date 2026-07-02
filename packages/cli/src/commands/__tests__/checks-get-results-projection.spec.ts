import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckResult } from '../../rest/check-results.js'

vi.mock('../../rest/api.js', () => ({
  checks: { get: vi.fn() },
  checkStatuses: { get: vi.fn() },
  checkResults: { get: vi.fn(), getAll: vi.fn() },
  errorGroups: { getByCheckId: vi.fn(), get: vi.fn() },
  analytics: { get: vi.fn() },
}))

import * as api from '../../rest/api.js'
import ChecksGet from '../checks/get.js'

// The fixed, internal projection the recent-results table needs. Exactly the
// fields formatResults() and resolveResultStatus() read — kept in sync with
// RECENT_RESULTS_FIELDS in checks/get.ts.
const EXPECTED_FIELDS = ['id', 'startedAt', 'runLocation', 'hasErrors', 'hasFailures', 'isDegraded', 'responseTime']

function makeCheck () {
  return {
    id: 'check-1',
    name: 'My API Check',
    description: null,
    checkType: 'API',
    activated: true,
    muted: false,
    frequency: 10,
    locations: ['eu-west-1'],
    privateLocations: [],
    tags: [],
    groupId: null,
    scriptPath: null,
    request: { url: 'https://example.com', method: 'GET' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function makeResult (overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: 'r1',
    checkId: 'check-1',
    name: 'My API Check',
    hasFailures: false,
    hasErrors: false,
    isDegraded: false,
    overMaxResponseTime: false,
    runLocation: 'eu-west-1',
    startedAt: '2026-05-20T08:00:00.000Z',
    stoppedAt: '2026-05-20T08:00:04.000Z',
    created_at: '2026-05-20T08:00:04.000Z',
    responseTime: 4000,
    checkRunId: 1,
    attempts: 1,
    resultType: 'FINAL',
    sequenceId: 'seq-1',
    ...overrides,
  }
}

function createCommandContext (parsed: unknown) {
  const logged: string[] = []
  return Object.assign(Object.create(ChecksGet.prototype), {
    parse: vi.fn().mockResolvedValue(parsed),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    style: { outputFormat: undefined, longError: vi.fn() },
    logged,
  })
}

describe('checks get recent-results projection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.mocked(api.checks.get).mockResolvedValue({ data: makeCheck() } as any)
    vi.mocked(api.checkStatuses.get).mockResolvedValue({ data: undefined } as any)
    vi.mocked(api.errorGroups.getByCheckId).mockResolvedValue({ data: [] } as any)
    vi.mocked(api.analytics.get).mockResolvedValue({ data: undefined } as any)
    vi.mocked(api.checkResults.getAll).mockResolvedValue({
      data: { entries: [makeResult()], nextId: null, length: 1 },
    } as any)
  })

  it('requests only the narrow projection for default (detail) output', async () => {
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'results-limit': 10, 'output': 'detail', 'stats-range': 'last24Hours' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    expect(api.checkResults.getAll).toHaveBeenCalledWith('check-1', {
      limit: 10,
      nextId: undefined,
      fields: EXPECTED_FIELDS,
    })
  })

  it('forwards a results cursor unchanged alongside the projection', async () => {
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'results-limit': 25, 'results-cursor': 'cursor-abc', 'output': 'detail', 'stats-range': 'last24Hours' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    expect(api.checkResults.getAll).toHaveBeenCalledWith('check-1', {
      limit: 25,
      nextId: 'cursor-abc',
      fields: EXPECTED_FIELDS,
    })
  })

  it('requests the narrow projection for markdown output', async () => {
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'results-limit': 10, 'output': 'md', 'stats-range': 'last24Hours' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    expect(api.checkResults.getAll).toHaveBeenCalledWith('check-1', {
      limit: 10,
      nextId: undefined,
      fields: EXPECTED_FIELDS,
    })
  })

  it('does not project fields for json output (preserves full results entries)', async () => {
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { 'results-limit': 10, 'output': 'json', 'stats-range': 'last24Hours' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    expect(api.checkResults.getAll).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(api.checkResults.getAll).mock.calls[0][1]
    expect(callArgs).not.toHaveProperty('fields')
    expect(callArgs).toMatchObject({ limit: 10, nextId: undefined })
  })

  it('--result drilldown uses the detail endpoint and never lists with projection', async () => {
    vi.mocked(api.checkResults.get).mockResolvedValue({
      data: makeResult({ id: 'res-42', resultType: 'FINAL', attempts: 1 }),
    } as any)
    const ctx = createCommandContext({
      args: { id: 'check-1' },
      flags: { result: 'res-42', output: 'detail' },
    })

    await ChecksGet.prototype.run.call(ctx as any)

    expect(api.checkResults.get).toHaveBeenCalledWith('check-1', 'res-42')
    expect(api.checkResults.getAll).not.toHaveBeenCalled()
  })
})
