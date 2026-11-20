import { describe, expect, it } from 'vitest'
import { InvalidInputError } from '../invalid-input-error.js'
import { describeSpendingCapError, parseDollarsToCents, spendingCapChanges } from '../spending-cap.js'
import { ConflictError, ForbiddenError, ACCOUNT_NOT_ACCESSIBLE, UnauthorizedError } from '../../rest/errors.js'
import type { SpendingCap } from '../../rest/spending-cap.js'

describe('parseDollarsToCents', () => {
  it.each([
    ['50', 5000], ['12.5', 1250], ['12.50', 1250], ['0', 0], ['0.01', 1],
    ['0.29', 29], ['1.15', 115], ['10000', 1000000], ['10000.00', 1000000], [' 7 ', 700],
  ])('%s → %i cents', (input, cents) => {
    expect(parseDollarsToCents(input)).toBe(cents)
  })

  it.each(['-5', '10000.01', '20000', '1.234', 'abc', '', '1e3', '$5', '.5', '5.', 'NaN', 'Infinity'])(
    'rejects %j as invalid input', input => {
      expect(() => parseDollarsToCents(input)).toThrow(InvalidInputError)
    })
})

const standing = (overageCents: number): SpendingCap['standing'] => ({
  measuredAt: '2099-11-15T00:00:00.000Z', pools: {}, overageCents, limit: null,
})

describe('spendingCapChanges', () => {
  it('describes setting, changing and removing', () => {
    expect(spendingCapChanges({ spendingCapCents: null, standing: null }, 2000))
      .toEqual(['Set the spending cap to $20.00'])
    expect(spendingCapChanges({ spendingCapCents: 5000, standing: standing(0) }, 2000))
      .toEqual(['Change the spending cap from $50.00 to $20.00'])
    expect(spendingCapChanges({ spendingCapCents: 5000, standing: null }, null))
      .toEqual(['Remove the spending cap of $50.00'])
    expect(spendingCapChanges({ spendingCapCents: null, standing: null }, null))
      .toEqual(['Remove the spending cap (none is set)'])
  })

  it('warns when the new cap is at or below the overage so far', () => {
    const changes = spendingCapChanges({ spendingCapCents: 5000, standing: standing(1806.25) }, 1800)
    expect(changes[1]).toMatch(/overage so far \(\$18\.06\) is at or above the new cap.*stop running at once/)
    expect(spendingCapChanges({ spendingCapCents: 5000, standing: standing(1806.25) }, 1807)).toHaveLength(1)
  })

  it('warns about a $0 cap', () => {
    expect(spendingCapChanges({ spendingCapCents: 5000, standing: null }, 0)[1])
      .toMatch(/\$0\.00 cap allows no overage/)
  })
})

describe('describeSpendingCapError', () => {
  it('maps 409, 403 and 401 to clear messages', () => {
    expect(describeSpendingCapError(new UnauthorizedError({ statusCode: 401, error: 'Unauthorized', message: 'x' }), 'billing:read'))
      .toMatch(/legacy account API keys are not accepted/)
    expect(describeSpendingCapError(new ConflictError({ statusCode: 409, error: 'Conflict', message: 'x' }), 'billing:update'))
      .toMatch(/plan cannot have a spending cap/)
    expect(describeSpendingCapError(new ForbiddenError({ statusCode: 403, error: 'Forbidden', message: 'x' }), 'billing:update'))
      .toMatch(/billing:update permission/)
  })

  it('passes other errors through', () => {
    const notAccessible = new ForbiddenError({
      statusCode: 403, error: 'Forbidden', message: 'x', errorCode: ACCOUNT_NOT_ACCESSIBLE,
    })
    expect(describeSpendingCapError(notAccessible, 'billing:read')).toBe(notAccessible)
  })
})
