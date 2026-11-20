import { InvalidInputError } from './invalid-input-error.js'
import { ConflictError, ForbiddenError, isAccountNotAccessible } from '../rest/errors.js'
import { formatDollars } from '../formatters/spending-limit.js'
import type { SpendingLimit } from '../rest/spending-limit.js'

export const MAX_SPENDING_LIMIT_DOLLARS = 10000

/**
 * A dollar amount (`50`, `12.5`, `12.50`) as integer cents, from the digits so
 * no float rounding creeps in. At most 2 decimals, from 0 to 10000.
 */
export function parseDollarsToCents (input: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!match) {
    throw new InvalidInputError(
      `Invalid amount "${input}". Use a non-negative dollar amount with at most 2 decimals, e.g. 50 or 12.50.`)
  }
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  if (cents > MAX_SPENDING_LIMIT_DOLLARS * 100) {
    throw new InvalidInputError(
      `Invalid amount "${input}". The spending limit can be at most ${formatDollars(MAX_SPENDING_LIMIT_DOLLARS * 100)}.`)
  }
  return cents
}

/** The preview lines for changing the limit from `current` to `capCents` (`null` removes it). */
export function spendingLimitChanges (current: SpendingLimit, capCents: number | null): string[] {
  const from = current.spendingCapCents
  const changes = [
    capCents === null
      ? from === null ? 'Remove the spending limit (none is set)' : `Remove the spending limit of ${formatDollars(from)}`
      : from === null
        ? `Set the spending limit to ${formatDollars(capCents)}`
        : `Change the spending limit from ${formatDollars(from)} to ${formatDollars(capCents)}`,
  ]
  const overage = current.standing?.overageCents ?? 0
  if (capCents !== null && overage > 0 && capCents <= overage) {
    changes.push(`Warning: overage so far (${formatDollars(overage)}) is at or above the new limit, `
      + 'so checks stop running at once')
  } else if (capCents === 0) {
    changes.push('Warning: a $0.00 limit allows no overage, so checks stop running as soon as '
      + 'the included runs are used up')
  }
  return changes
}

/** Clear messages for the API's 403 and 409; anything else as it came. */
export function describeSpendingLimitError (err: unknown, permission: 'billing:read' | 'billing:update'): string | Error {
  if (err instanceof ConflictError) {
    return 'This account\'s plan cannot have a spending limit (for example prepaid or contract plans). '
      + `(${err.message})`
  }
  if (err instanceof ForbiddenError && !isAccountNotAccessible(err)) {
    return `Not allowed: your role needs the ${permission} permission, and the account must manage its plan `
      + `in Checkly (self-serve billing). Ask an account owner or admin. (${err.message})`
  }
  return err instanceof Error ? err : String(err)
}
