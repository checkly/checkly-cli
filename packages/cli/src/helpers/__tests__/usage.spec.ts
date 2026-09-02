import { describe, expect, it } from 'vitest'
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../rest/errors.js'
import { describeUsageError, parseDateOnly, usageRangeParams, usageTermsParams } from '../usage.js'

describe('parseDateOnly', () => {
  it('returns undefined when the value is omitted', () => {
    expect(parseDateOnly(undefined, '--to')).toBeUndefined()
  })

  it('accepts a valid calendar date and trims whitespace', () => {
    expect(parseDateOnly(' 2026-02-28 ', '--to')).toBe('2026-02-28')
  })

  it.each(['2026-2-1', '01-02-2026', '2026-02-30', '2026-13-01', 'yesterday', ''])('rejects "%s"', value => {
    expect(() => parseDateOnly(value, '--to')).toThrow('--to must be a valid calendar date in YYYY-MM-DD format.')
  })
})

describe('usageTermsParams', () => {
  it('maps flags to API params', () => {
    expect(usageTermsParams({ 'usage-terms-id': 'terms-1', 'to': '2026-01-31' })).toEqual({
      usageTermsId: 'terms-1',
      to: '2026-01-31',
    })
  })
})

describe('usageRangeParams', () => {
  it('maps flags to API params', () => {
    expect(usageRangeParams({
      'usage-terms-id': 'terms-1',
      'from': '2026-01-01',
      'to': '2026-01-31',
      'account-id': ['acc-a'],
      'check-type': ['API', 'BROWSER'],
    })).toEqual({
      usageTermsId: 'terms-1',
      from: '2026-01-01',
      to: '2026-01-31',
      accountIds: ['acc-a'],
      checkTypes: ['API', 'BROWSER'],
    })
  })

  it('rejects a from date after the to date', () => {
    expect(() => usageRangeParams({ from: '2026-02-01', to: '2026-01-01' }))
      .toThrow('--from must be on or before --to.')
  })
})

describe('describeUsageError', () => {
  const body = (code: string, statusCode: number, message = 'Upstream message.') =>
    ({ statusCode, error: 'Error', message, code }) as any

  it('explains missing usage terms', () => {
    expect(describeUsageError(new NotFoundError(body('NO_USAGE_TERMS', 404))))
      .toContain('No usage terms cover this account')
  })

  it('explains conflicting usage terms', () => {
    expect(describeUsageError(new ValidationError(body('USAGE_TERMS_CONFLICT', 409))))
      .toContain('--usage-terms-id')
  })

  it('explains an account outside the terms and keeps the upstream message', () => {
    const message = describeUsageError(new ValidationError(body('ACCOUNT_NOT_IN_USAGE_TERMS', 400, 'Account x is not part')))
    expect(message).toContain('Account x is not part')
    expect(message).toContain('checkly usage terms')
  })

  it('explains an invalid cursor', () => {
    expect(describeUsageError(new ValidationError(body('INVALID_CURSOR', 400))))
      .toContain('--cursor')
  })

  it('passes an invalid range message through', () => {
    expect(describeUsageError(new ValidationError(body('INVALID_RANGE', 400, '"from" must be on or before "to"'))))
      .toBe('"from" must be on or before "to"')
  })

  it('explains an unavailable usage store', () => {
    expect(describeUsageError(new ValidationError(body('USAGE_STORE_UNAVAILABLE', 502))))
      .toContain('temporarily unavailable')
  })

  it('explains a legacy API key rejection', () => {
    expect(describeUsageError(new UnauthorizedError({ statusCode: 401, error: 'Unauthorized', message: '' })))
      .toContain('legacy account API keys')
  })

  it('explains a missing admin role', () => {
    expect(describeUsageError(new ForbiddenError({ statusCode: 403, error: 'Forbidden', message: '' })))
      .toContain('Owner or Admin')
  })

  it('returns undefined for unrelated errors', () => {
    expect(describeUsageError(new Error('boom'))).toBeUndefined()
  })
})
