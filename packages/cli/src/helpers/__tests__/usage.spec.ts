import { Parser } from '@oclif/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../rest/errors.js'
import {
  describeUsageError, projectionsParams, usageRangeParams, usageSeriesFlags, usageSeriesParams,
  usageTermsParams, validateUsageTermId,
} from '../usage.js'

const id = '550e8400-e29b-41d4-a716-446655440000'
const account = 'a1111111-1111-1111-1111-111111111111'
const seriesFlags = { 'interval': 'day', 'group-by': 'account,checkType', 'limit': 100 } as const
afterEach(() => vi.useRealTimers())

describe('usage input validation', () => {
  it('preserves valid trimmed leap and early calendar dates in term queries', () => {
    expect(usageTermsParams({ to: ' 2024-02-29 ', limit: 100 }).to).toBe('2024-02-29')
    expect(usageTermsParams({ to: '0001-01-01', limit: 100 }).to).toBe('0001-01-01')
  })

  it.each(['2026-2-1', '01-02-2026', '2026-02-30', '2026-13-01', 'yesterday', ''])('rejects date %s', value => {
    expect(() => usageTermsParams({ to: value, limit: 100 }))
      .toThrow('--to must be a valid calendar date in YYYY-MM-DD format.')
  })

  it('keeps omitted terms bounds unset', () => {
    expect(usageTermsParams({ limit: 100 })).toEqual({ from: undefined, to: undefined, limit: 100, nextId: undefined })
  })

  it('rejects reversed ranges for both terms and reports', () => {
    expect(() => usageTermsParams({ from: '2026-02-01', to: '2026-01-01', limit: 100 }))
      .toThrow('--from must be on or before --to.')
    expect(() => usageRangeParams({ from: '2026-02-01', to: '2026-01-01' }))
      .toThrow('--from must be on or before --to.')
  })

  it('parses whitespace, repeated and comma-delimited selections into distinct wire lists', () => {
    expect(usageRangeParams({ 'usage-terms-id': [` ${id},${id}`], 'account-id': [` ${account} `],
      'pricing-rule': [' apiChecks,aiInvocations ', 'apiChecks'] })).toEqual({
      from: undefined, to: undefined, usageTermsIds: [id], accountIds: [account],
      pricingRuleKeys: ['apiChecks', 'aiInvocations'],
    })
  })

  it('validates strict term UUIDs and accepts backend account GUIDs without version restrictions', () => {
    expect(validateUsageTermId(` ${id} `)).toBe(id)
    expect(() => validateUsageTermId(account)).toThrow('valid UUID')
    expect(usageRangeParams({ 'account-id': [account] }).accountIds).toEqual([account])
    expect(() => usageRangeParams({ 'account-id': ['not-an-id'] })).toThrow('valid GUIDs')
    expect(() => usageRangeParams({ 'usage-terms-id': ['../term'] })).toThrow('valid UUID')
  })

  it.each(['account-id', 'usage-terms-id', 'pricing-rule'] as const)('rejects empty members of %s', flag => {
    expect(() => usageRangeParams({ [flag]: [','] })).toThrow('empty values')
    expect(() => usageRangeParams({ [flag]: [] })).toThrow('empty values')
  })

  it('enforces backend maximum list length before deduplication', () => {
    expect(usageRangeParams({ 'usage-terms-id': Array(100).fill(id) }).usageTermsIds).toEqual([id])
    expect(() => usageRangeParams({ 'account-id': Array(101).fill(account) })).toThrow('at most 100')
    expect(() => usageRangeParams({ 'usage-terms-id': Array(101).fill(id) })).toThrow('at most 100')
    expect(() => usageRangeParams({ 'pricing-rule': Array(101).fill('apiChecks') })).toThrow('at most 100')
  })

  it('parses all grouping dimensions and optional includes with deduplication', () => {
    expect(usageSeriesParams({ ...seriesFlags,
      'group-by': ' pricingRule,usageTerm,account,checkType,account ',
      'include': [' runs, calculations ', 'runs'] })).toMatchObject({
      interval: 'day', groupBy: ['pricingRule', 'usageTerm', 'account', 'checkType'],
      include: ['runs', 'calculations'], limit: 100,
    })
  })

  it.each(['', 'account,', 'unknown', 'none,account'])('rejects invalid grouping %s', value => {
    expect(() => usageSeriesParams({ ...seriesFlags, 'group-by': value })).toThrow('--group-by')
  })

  it('rejects unknown enum values', () => {
    expect(() => usageRangeParams({ 'pricing-rule': ['API'] })).toThrow('--pricing-rule must be one of')
    expect(() => usageSeriesParams({ ...seriesFlags, include: ['meters'] })).toThrow('--include must be one of')
  })

  it('rejects an unsupported interval at the CLI parser boundary', async () => {
    await expect(Parser.parse(['--interval', 'hour'], { flags: usageSeriesFlags() })).rejects.toThrow('hour')
    const parsed = await Parser.parse(['--interval', 'week'], { flags: usageSeriesFlags() })
    expect(usageSeriesParams(parsed.flags).interval).toBe('week')
  })

  it.each([0, 501, 1.5])('rejects page limit %s', limit => {
    expect(() => usageTermsParams({ limit })).toThrow('--limit')
    expect(() => usageSeriesParams({ ...seriesFlags, limit })).toThrow('--limit')
  })

  it('rejects empty or oversized cursors while preserving opaque bytes', () => {
    expect(() => usageTermsParams({ limit: 1, cursor: '' })).toThrow('--cursor')
    expect(() => usageSeriesParams({ ...seriesFlags, cursor: 'x'.repeat(4097) })).toThrow('--cursor')
    expect(usageTermsParams({ limit: 1, cursor: 'opaque \' ` $()' }).nextId).toBe('opaque \' ` $()')
  })

  it('accepts only completed projection dates at UTC midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-13T00:00:01Z'))
    expect(projectionsParams({ 'as-of': '2026-10-12' })).toEqual({ asOf: '2026-10-12' })
    expect(() => projectionsParams({ 'as-of': '2026-10-13' })).toThrow('completed UTC date')
    expect(() => projectionsParams({ 'as-of': '2027-01-01' })).toThrow('completed UTC date')
  })
})

describe('usage error guidance', () => {
  const body = (code: string, message = 'Upstream message') => ({ statusCode: 400, error: 'Error', message, code })
  it('explains no-term discovery and overlap selection', () => {
    expect(describeUsageError(new NotFoundError(body('NO_USAGE_TERMS')))).toContain('checkly account usage terms')
    const conflict = describeUsageError(new ValidationError(body('USAGE_TERMS_CONFLICT')))
    expect(conflict).toContain('non-overlapping terms')
    expect(conflict).toContain('--usage-terms-id')
  })
  it('retains account guidance and upstream range messages', () => {
    expect(describeUsageError(new ValidationError(body('ACCOUNT_NOT_IN_USAGE_TERMS', 'Account x is not part'))))
      .toBe('Account x is not part. Run "checkly account usage terms" to list the accounts covered by the terms.')
    expect(describeUsageError(new ValidationError(body('INVALID_RANGE', 'Bad range')))).toBe('Bad range')
  })
  it('explains cursor identity, storage retry and key types', () => {
    expect(describeUsageError(new ValidationError(body('INVALID_CURSOR')))).toContain('effective --from and --to')
    expect(describeUsageError(new ValidationError(body('USAGE_STORE_UNAVAILABLE')))).toContain('temporarily unavailable')
    expect(describeUsageError(new UnauthorizedError(body('')))).toContain('user or service API key')
  })
  it('blames a missing permission only on a 403 without a code', () => {
    expect(describeUsageError(new ForbiddenError(body(''))))
      .toBe('Usage reporting requires the usage:read permission on this account.')
    const inaccessible = new ForbiddenError({ ...body(''), errorCode: 'ERR_ACCOUNT_NOT_ACCESSIBLE' })
    expect(describeUsageError(inaccessible)).toBe(inaccessible)
  })
  it('distinguishes a missing term from organization discovery failures', () => {
    expect(describeUsageError(new NotFoundError(body('')), { termId: id })).toBe(`Usage term ${id} was not found.`)
    const failure = new Error('unrelated')
    expect(describeUsageError(failure)).toBe(failure)
    expect(describeUsageError('plain failure')).toBe('plain failure')
  })
})
