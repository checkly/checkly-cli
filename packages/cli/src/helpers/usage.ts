import { Flags } from '@oclif/core'
import { allCheckTypes } from '../constants.js'
import { ApiError, type ErrorData, ForbiddenError, UnauthorizedError } from '../rest/errors.js'
import type { UsageErrorCode, UsageRangeParams, UsageTermsParams } from '../rest/usage.js'

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function usageTermsFlags () {
  return {
    'usage-terms-id': Flags.string({
      description: 'Usage terms ID to report on. Defaults to the terms that cover the --to date.',
    }),
    'to': Flags.string({
      description: 'End date (YYYY-MM-DD, inclusive). Defaults to today.',
    }),
  }
}

export function usageRangeFlags () {
  return {
    ...usageTermsFlags(),
    'from': Flags.string({
      description: 'Start date (YYYY-MM-DD, inclusive). Defaults to the usage start date of the terms.',
    }),
    'account-id': Flags.string({
      description: 'Only include these account IDs. Repeat the flag or comma-separate values.',
      multiple: true,
      delimiter: ',',
    }),
    'check-type': Flags.string({
      description: 'Only include these check types. Repeat the flag or comma-separate values.',
      multiple: true,
      delimiter: ',',
      options: allCheckTypes,
    }),
  }
}

export function parseDateOnly (value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined

  const trimmed = value.trim()
  const error = new Error(`${label} must be a valid calendar date in YYYY-MM-DD format.`)
  if (!DATE_ONLY_PATTERN.test(trimmed)) throw error

  // Date.UTC rolls 2026-02-30 over to March 2nd, so round-trip the parts.
  const [year, month, day] = trimmed.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw error
  }

  return trimmed
}

interface UsageTermsFlagValues {
  'usage-terms-id'?: string
  'to'?: string
}

interface UsageRangeFlagValues extends UsageTermsFlagValues {
  'from'?: string
  'account-id'?: string[]
  'check-type'?: string[]
}

export function usageTermsParams (flags: UsageTermsFlagValues): UsageTermsParams {
  return {
    usageTermsId: flags['usage-terms-id'],
    to: parseDateOnly(flags['to'], '--to'),
  }
}

export function usageRangeParams (flags: UsageRangeFlagValues): UsageRangeParams {
  const from = parseDateOnly(flags['from'], '--from')
  const terms = usageTermsParams(flags)
  if (from && terms.to && from > terms.to) {
    throw new Error('--from must be on or before --to.')
  }

  return {
    ...terms,
    from,
    accountIds: flags['account-id'],
    checkTypes: flags['check-type'],
  }
}

export function describeUsageError (err: unknown): string | undefined {
  if (!(err instanceof ApiError)) return undefined

  // The usage API adds `code` to the standard Boom body; ErrorData does not declare it.
  const code = (err.data as ErrorData & { code?: UsageErrorCode }).code
  switch (code) {
    case 'NO_USAGE_TERMS':
      return 'No usage terms cover this account for the requested date. '
        + 'Usage reporting is available to accounts that belong to an organization with a usage contract.'
    case 'USAGE_TERMS_CONFLICT':
      return 'More than one set of usage terms covers the requested date. '
        + 'Pass --usage-terms-id to choose one, or pick a --to date that only one contract covers.'
    case 'ACCOUNT_NOT_IN_USAGE_TERMS':
      return `${err.message} Run "checkly usage terms" to list the accounts covered by the terms.`
    case 'INVALID_CURSOR':
      return 'The --cursor value is invalid or was issued for different flags. '
        + 'Re-run the original command with the same flags (including --from and --to) and use the cursor it prints.'
    case 'INVALID_RANGE':
      return err.message
    case 'USAGE_STORE_UNAVAILABLE':
      return 'The usage store is temporarily unavailable. Try again in a few minutes.'
  }

  if (err instanceof UnauthorizedError) {
    return 'Usage reporting requires a user or service API key; legacy account API keys are not accepted.'
  }
  if (err instanceof ForbiddenError) {
    return 'Usage reporting requires the Owner or Admin role on this account.'
  }
  return undefined
}
