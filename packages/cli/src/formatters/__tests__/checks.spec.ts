import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stripAnsi } from '../render'
import {
  formatSummaryBar,
  formatTypeBreakdown,
  formatPaginationInfo,
  formatNavigationHints,
  formatChecks,
  formatCheckDetail,
  formatResults,
  formatErrorGroups,
  getActivatedStatuses,
} from '../checks'
import { scenario } from '../../rest/__tests__/__fixtures__/api'
import {
  passingCheck,
  failingCheck,
  inactiveCheck,
  mutedCheck,
  errorCheck,
  degradedCheck,
  mutedFailingCheck,
  mutedDegradedCheck,
  checkWithPrivateLocations,
  checkWithLowSsl,
  checkWithMediumSsl,
  checkWithNoSsl,
  passingStatus,
  failingStatus,
  degradedStatus,
  errorStatus,
  apiCheckResult,
  browserCheckResult,
  activeErrorGroup,
  archivedErrorGroup,
  errorGroupWithRca,
  errorGroupWithoutRca,
} from './__fixtures__/fixtures'

// Pin time for timeAgo used in results/error groups
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-06-15T12:05:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getActivatedStatuses', () => {
  it('excludes statuses whose check is deactivated', () => {
    const { checks, statuses } = scenario('mixed')
    const deactivatedIds = new Set(checks.filter(c => !c.activated).map(c => c.id))
    const result = getActivatedStatuses(checks, statuses)
    // mixed: 16 statuses (13 active + 3 stale on deactivated). Expected: 13.
    expect(result).toHaveLength(13)
    expect(result.every(s => !deactivatedIds.has(s.checkId))).toBe(true)
  })

  it('returns empty for an all-deactivated account', () => {
    const { checks, statuses } = scenario('all-deactivated')
    expect(getActivatedStatuses(checks, statuses)).toEqual([])
  })
})

describe('formatSummaryBar', () => {
  it('renders account-wide 4-bucket bar with "Account:" prefix and no total label', () => {
    const { checks, statuses } = scenario('mixed')
    const result = stripAnsi(formatSummaryBar(checks, statuses))
    // mixed: 8 passing, 2 degraded, 3 failing, 1 no-status (not counted),
    //        5 deactivated -> all in inactive bucket.
    expect(result).toContain('Account:')
    expect(result).toContain('8 passing')
    expect(result).toContain('2 degraded')
    expect(result).toContain('3 failing')
    expect(result).toContain('5 inactive')
    expect(result).not.toContain('total checks')
  })

  it('does not count stale passing statuses on deactivated checks as passing', () => {
    // Regression: 3 of the 5 deactivated checks carry stale hasFailures=false statuses.
    // Before the fix they leaked into the passing count. With all-deactivated only the
    // inactive bucket should remain.
    const { checks, statuses } = scenario('all-deactivated')
    expect(stripAnsi(formatSummaryBar(checks, statuses))).toBe('Account:  ⊘ 5 inactive')
  })

  it('hides zero-count buckets', () => {
    const { checks, statuses } = scenario('all-passing')
    const result = stripAnsi(formatSummaryBar(checks, statuses))
    expect(result).toContain('6 passing')
    expect(result).not.toMatch(/degraded|failing|inactive/)
  })

  it('returns an empty string when the account has no checks', () => {
    expect(formatSummaryBar([], [])).toBe('')
  })
})

describe('formatTypeBreakdown', () => {
  it('shows counts per check type sorted by count descending', () => {
    const checks = [
      { ...passingCheck, checkType: 'BROWSER' },
      { ...passingCheck, checkType: 'BROWSER' },
      { ...passingCheck, checkType: 'BROWSER' },
      { ...passingCheck, checkType: 'API' },
      { ...passingCheck, checkType: 'API' },
      { ...passingCheck, checkType: 'HEARTBEAT' },
    ]
    const result = stripAnsi(formatTypeBreakdown(checks))
    expect(result).toContain('BROWSER: 3')
    expect(result).toContain('API: 2')
    expect(result).toContain('HEARTBEAT: 1')
    // BROWSER (3) should come before API (2)
    expect(result.indexOf('BROWSER: 3')).toBeLessThan(result.indexOf('API: 2'))
  })

  it('omits types with zero count', () => {
    const checks = [
      { ...passingCheck, checkType: 'API' },
    ]
    const result = stripAnsi(formatTypeBreakdown(checks))
    expect(result).toContain('API: 1')
    expect(result).not.toContain('BROWSER')
  })

  it('filters by activeCheckIds when provided', () => {
    const checks = [
      { ...passingCheck, id: 'a', checkType: 'API' },
      { ...passingCheck, id: 'b', checkType: 'API' },
      { ...passingCheck, id: 'c', checkType: 'BROWSER' },
    ]
    const activeIds = new Set(['a', 'c'])
    const result = stripAnsi(formatTypeBreakdown(checks, activeIds))
    expect(result).toContain('API: 1')
    expect(result).toContain('BROWSER: 1')
  })

  it('type counts sum to number of input checks', () => {
    const checks = [
      { ...passingCheck, checkType: 'BROWSER' },
      { ...passingCheck, checkType: 'BROWSER' },
      { ...passingCheck, checkType: 'API' },
      { ...passingCheck, checkType: 'HEARTBEAT' },
      { ...passingCheck, checkType: 'TCP' },
    ]
    const result = stripAnsi(formatTypeBreakdown(checks))
    const sum = [...result.matchAll(/(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0)
    expect(sum).toBe(checks.length)
  })

  it('type counts sum to activeCheckIds size when filtered', () => {
    const checks = [
      { ...passingCheck, id: 'a', checkType: 'API' },
      { ...passingCheck, id: 'b', checkType: 'BROWSER' },
      { ...passingCheck, id: 'c', checkType: 'BROWSER' },
      { ...passingCheck, id: 'd', checkType: 'TCP' },
    ]
    const activeIds = new Set(['a', 'b', 'd'])
    const result = stripAnsi(formatTypeBreakdown(checks, activeIds))
    const sum = [...result.matchAll(/(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0)
    expect(sum).toBe(activeIds.size)
  })

  it('returns empty string for empty list', () => {
    const result = formatTypeBreakdown([])
    expect(stripAnsi(result)).toBe('')
  })
})

describe('formatPaginationInfo', () => {
  it('shows correct range and page numbers', () => {
    const result = stripAnsi(formatPaginationInfo({ page: 2, limit: 10, total: 35 }))
    expect(result).toContain('11-20')
    expect(result).toContain('35 checks')
    expect(result).toContain('page 2/4')
  })

  it('clamps end to total on last page', () => {
    const result = stripAnsi(formatPaginationInfo({ page: 4, limit: 10, total: 35 }))
    expect(result).toContain('31-35')
  })
})

describe('formatNavigationHints', () => {
  it('shows next page hint when not on last page', () => {
    const result = stripAnsi(formatNavigationHints({ page: 1, limit: 10, total: 25 }, []))
    expect(result).toContain('--page 2')
    expect(result).toContain('View check')
    expect(result).toContain('Filter')
  })

  it('shows prev page hint when not on first page', () => {
    const result = stripAnsi(formatNavigationHints({ page: 2, limit: 10, total: 25 }, []))
    expect(result).toContain('--page 1')
    expect(result).toContain('--page 3')
  })

  it('omits filter hint when filters are active', () => {
    const result = stripAnsi(formatNavigationHints({ page: 1, limit: 10, total: 25 }, ['--tag prod']))
    expect(result).not.toContain('Filter')
  })
})

describe('formatChecks — status edge cases', () => {
  it('renders hasErrors check as failing in terminal', () => {
    const result = stripAnsi(formatChecks([errorCheck], 'terminal'))
    expect(result).toContain('failing')
  })

  it('renders hasErrors check as failing in md', () => {
    const result = formatChecks([errorCheck], 'md')
    expect(result).toContain('failing')
  })

  it('renders degraded check', () => {
    const result = stripAnsi(formatChecks([degradedCheck], 'terminal'))
    expect(result).toContain('degraded')
  })

  it('renders muted failing check as failing (muted) in md', () => {
    const result = formatChecks([mutedFailingCheck], 'md')
    expect(result).toContain('failing (muted)')
  })

  it('renders muted degraded check as degraded (muted) in md', () => {
    const result = formatChecks([mutedDegradedCheck], 'md')
    expect(result).toContain('degraded (muted)')
  })

  it('renders muted failing check in terminal', () => {
    const result = stripAnsi(formatChecks([mutedFailingCheck], 'terminal'))
    expect(result).toContain('failing')
  })

  it('renders muted degraded check in terminal', () => {
    const result = stripAnsi(formatChecks([mutedDegradedCheck], 'terminal'))
    expect(result).toContain('degraded')
  })
})

describe('formatChecks', () => {
  const checks = [passingCheck, failingCheck, inactiveCheck, mutedCheck]

  it('renders terminal table', () => {
    const result = stripAnsi(formatChecks(checks, 'terminal'))
    expect(result).toMatchSnapshot('checks-table-terminal')
  })

  it('renders terminal table with showId', () => {
    const result = stripAnsi(formatChecks(checks, 'terminal', { showId: true }))
    expect(result).toMatchSnapshot('checks-table-terminal-with-id')
  })

  it('renders markdown table', () => {
    const result = formatChecks(checks, 'md')
    expect(result).toMatchSnapshot('checks-table-md')
  })

  it('renders markdown with pagination', () => {
    const result = formatChecks(checks, 'md', { pagination: { page: 1, limit: 10, total: 25 } })
    expect(result).toMatchSnapshot('checks-table-md-paginated')
  })

  it('contains expected header columns in terminal', () => {
    const result = stripAnsi(formatChecks(checks, 'terminal'))
    expect(result).toContain('NAME')
    expect(result).toContain('TYPE')
    expect(result).toContain('STATUS')
    expect(result).toContain('FREQ')
    expect(result).toContain('TAGS')
  })

  it('contains expected header columns in markdown', () => {
    const result = formatChecks(checks, 'md')
    expect(result).toContain('| Name |')
    expect(result).toContain('| --- |')
  })
})

describe('formatCheckDetail', () => {
  it('renders terminal detail', () => {
    const result = stripAnsi(formatCheckDetail(passingCheck, 'terminal'))
    expect(result).toMatchSnapshot('check-detail-terminal')
  })

  it('renders markdown detail', () => {
    const result = formatCheckDetail(passingCheck, 'md')
    expect(result).toMatchSnapshot('check-detail-md')
  })

  it('contains key fields in terminal output', () => {
    const result = stripAnsi(formatCheckDetail(passingCheck, 'terminal'))
    expect(result).toContain('My API Check')
    expect(result).toContain('API')
    expect(result).toContain('passing')
    expect(result).toContain('eu-west-1')
    expect(result).toContain('check-1')
  })

  it('shows description when present', () => {
    const checkWithDesc = { ...passingCheck, description: 'Monitors the health endpoint' }
    const result = stripAnsi(formatCheckDetail(checkWithDesc, 'terminal'))
    expect(result).toContain('Description')
    expect(result).toContain('Monitors the health endpoint')
  })

  it('omits description in terminal when null', () => {
    const result = stripAnsi(formatCheckDetail(passingCheck, 'terminal'))
    expect(result).not.toContain('Description')
  })

  it('shows description as dash in markdown when null', () => {
    const result = formatCheckDetail(passingCheck, 'md')
    expect(result).toContain('| Description | - |')
  })

  it('shows empty description in terminal', () => {
    const checkWithEmptyDesc = { ...passingCheck, description: '' }
    const result = stripAnsi(formatCheckDetail(checkWithEmptyDesc, 'terminal'))
    expect(result).toContain('Description:')
  })

  it('shows empty description in markdown', () => {
    const checkWithEmptyDesc = { ...passingCheck, description: '' }
    const result = formatCheckDetail(checkWithEmptyDesc, 'md')
    expect(result).toContain('| Description |  |')
  })

  it('escapes markdown-unsafe description in markdown detail', () => {
    const checkWithUnsafeDesc = { ...passingCheck, description: 'has | pipe\nand newline' }
    const result = formatCheckDetail(checkWithUnsafeDesc, 'md')
    expect(result).toContain('| Description | has \\| pipe and newline |')
  })

  it('shows inactive status for deactivated check', () => {
    const result = stripAnsi(formatCheckDetail(inactiveCheck, 'terminal'))
    expect(result).toContain('inactive')
  })

  it('shows scriptPath when present', () => {
    const checkWithScript = { ...passingCheck, scriptPath: '__checks__/api.check.ts' }
    const result = stripAnsi(formatCheckDetail(checkWithScript, 'terminal'))
    expect(result).toContain('__checks__/api.check.ts')
  })

  it('shows hasErrors status as failing', () => {
    const result = stripAnsi(formatCheckDetail(errorCheck, 'terminal'))
    expect(result).toContain('failing')
  })

  it('merges privateLocations with (private) suffix', () => {
    const result = stripAnsi(formatCheckDetail(checkWithPrivateLocations, 'terminal'))
    expect(result).toContain('eu-west-1')
    expect(result).toContain('on-prem-dc-1 (private)')
    expect(result).toContain('on-prem-dc-2 (private)')
  })

  it('shows privateLocations in md', () => {
    const result = formatCheckDetail(checkWithPrivateLocations, 'md')
    expect(result).toContain('on-prem-dc-1 (private)')
  })

  it('shows SSL days remaining with low threshold', () => {
    const result = stripAnsi(formatCheckDetail(checkWithLowSsl, 'terminal'))
    expect(result).toContain('7 days remaining')
  })

  it('shows SSL days remaining with medium threshold', () => {
    const result = stripAnsi(formatCheckDetail(checkWithMediumSsl, 'terminal'))
    expect(result).toContain('20 days remaining')
  })

  it('omits SSL line when sslDaysRemaining is null in terminal', () => {
    const result = stripAnsi(formatCheckDetail(checkWithNoSsl, 'terminal'))
    expect(result).not.toContain('days remaining')
  })

  it('shows SSL as dash when null in md', () => {
    const result = formatCheckDetail(checkWithNoSsl, 'md')
    expect(result).toContain('| SSL | - |')
  })
})

describe('formatResults', () => {
  const results = [apiCheckResult, browserCheckResult]

  it('renders terminal table', () => {
    const result = stripAnsi(formatResults(results, 'terminal'))
    expect(result).toMatchSnapshot('results-table-terminal')
  })

  it('renders markdown table', () => {
    const result = formatResults(results, 'md')
    expect(result).toMatchSnapshot('results-table-md')
  })

  it('contains expected header columns in terminal', () => {
    const result = stripAnsi(formatResults(results, 'terminal'))
    expect(result).toContain('TIME')
    expect(result).toContain('LOCATION')
    expect(result).toContain('STATUS')
    expect(result).toContain('RESPONSE TIME')
  })
})

describe('formatErrorGroups', () => {
  it('renders terminal error groups', () => {
    const result = stripAnsi(formatErrorGroups([activeErrorGroup, archivedErrorGroup], 'terminal'))
    expect(result).toMatchSnapshot('error-groups-terminal')
  })

  it('renders markdown error groups', () => {
    const result = formatErrorGroups([activeErrorGroup, archivedErrorGroup], 'md')
    expect(result).toMatchSnapshot('error-groups-md')
  })

  it('returns empty string when all groups are archived', () => {
    expect(formatErrorGroups([archivedErrorGroup], 'terminal')).toBe('')
    expect(formatErrorGroups([archivedErrorGroup], 'md')).toBe('')
  })

  it('returns empty string for empty array', () => {
    expect(formatErrorGroups([], 'terminal')).toBe('')
  })

  it('shows RCA column with Yes for error groups with RCA', () => {
    const result = stripAnsi(formatErrorGroups([errorGroupWithRca], 'terminal'))
    expect(result).toContain('RCA')
    expect(result).toContain('Yes')
  })

  it('shows RCA column with dash for error groups without RCA', () => {
    const result = stripAnsi(formatErrorGroups([errorGroupWithoutRca], 'terminal'))
    expect(result).toContain('RCA')
    expect(result).toContain('-')
  })

  it('shows RCA column in markdown', () => {
    const result = formatErrorGroups([errorGroupWithRca], 'md')
    expect(result).toContain('| RCA |')
    expect(result).toContain('Yes')
  })

  it('shows dash in markdown for error groups without RCA', () => {
    const result = formatErrorGroups([errorGroupWithoutRca], 'md')
    expect(result).toContain('| - |')
  })
})
