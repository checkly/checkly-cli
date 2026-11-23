import { InvalidInputError } from './invalid-input-error.js'
import { ConflictError, ForbiddenError, isAccountNotAccessible, UnauthorizedError } from '../rest/errors.js'
import { formatDollars } from '../formatters/spending-cap.js'
import type { SpendingCap } from '../rest/spending-cap.js'

export const MAX_SPENDING_CAP_DOLLARS = 10000

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
  if (cents > MAX_SPENDING_CAP_DOLLARS * 100) {
    throw new InvalidInputError(
      `Invalid amount "${input}". The spending cap can be at most ${formatDollars(MAX_SPENDING_CAP_DOLLARS * 100)}.`)
  }
  return cents
}

/** The preview lines for changing the cap from `current` to `capCents` (`null` removes it). */
export function spendingCapChanges (current: SpendingCap, capCents: number | null): string[] {
  const from = current.spendingCapCents
  const changes = [
    capCents === null
      ? from === null ? 'Remove the spending cap (none is set)' : `Remove the spending cap of ${formatDollars(from)}`
      : from === null
        ? `Set the spending cap to ${formatDollars(capCents)}`
        : `Change the spending cap from ${formatDollars(from)} to ${formatDollars(capCents)}`,
  ]
  const overage = current.standing?.overageCents ?? 0
  if (capCents !== null && overage > 0 && capCents <= overage) {
    changes.push(`Warning: overage so far (${formatDollars(overage)}) is at or above the new cap, `
      + 'so checks stop running at once')
  } else if (capCents === 0) {
    changes.push('Warning: a $0.00 cap allows no overage, so checks stop running as soon as '
      + 'the included runs are used up')
  }
  return changes
}

/** Clear messages for the API's 401, 403 and 409; anything else as it came. */
export function describeSpendingCapError (err: unknown, permission: 'billing:read' | 'billing:update'): string | Error {
  if (err instanceof ConflictError) {
    return 'This account\'s plan cannot have a spending cap (for example prepaid or contract plans). '
      + `(${err.message})`
  }
  if (err instanceof UnauthorizedError) {
    return 'The spending cap requires a user or service API key; legacy account API keys are not accepted.'
  }
  if (err instanceof ForbiddenError && !isAccountNotAccessible(err)) {
    return `Not allowed: your role needs the ${permission} permission, and the account must manage its plan `
      + `in Checkly (self-serve billing). Ask an account owner or admin. (${err.message})`
  }
  return err instanceof Error ? err : String(err)
}
