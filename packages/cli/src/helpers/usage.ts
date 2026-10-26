import { Flags, type Interfaces } from '@oclif/core'
import { validate as isUuid } from 'uuid'
import { ApiError, ForbiddenError, isAccountNotAccessible, NotFoundError, UnauthorizedError } from '../rest/errors.js'
import {
  USAGE_GROUP_DIMENSIONS,
  USAGE_INTERVALS,
  USAGE_PRICING_RULE_KEYS,
  USAGE_SERIES_INCLUDES,
  type UsageInterval,
  type UsagePeriod,
  type UsageRangeParams,
  type UsageSeriesParams,
  type UsageTermsParams,
  type UsageProjectionsParams,
} from '../rest/usage.js'
import * as api from '../rest/api.js'
import type { UsageNames } from '../formatters/usage.js'
import { validateIntegerRange } from './number.js'
import { InvalidInputError } from './invalid-input-error.js'

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ACCOUNT_ID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

function paginationFlags () {
  return {
    limit: Flags.integer({ char: 'l', description: 'Number of entries to return (1-500).', default: 100 }),
    cursor: Flags.string({ description: 'Next-page cursor. Re-use the same date range and all selection flags.' }),
  }
}

export function usageTermsListFlags () {
  return {
    from: Flags.string({ description: 'Include terms ending on or after this UTC date (YYYY-MM-DD). No default.' }),
    to: Flags.string({ description: 'Include terms starting on or before this UTC date (YYYY-MM-DD). No default.' }),
    ...paginationFlags(),
  }
}

export function usageRangeFlags () {
  return {
    'from': Flags.string({
      description: 'Inclusive UTC start date (YYYY-MM-DD). Defaults to the earliest selected usage start, or --to.',
    }),
    'to': Flags.string({ description: 'Inclusive UTC end date (YYYY-MM-DD). Defaults to today.' }),
    'usage-terms-id': Flags.string({
      description: 'Select usage term UUIDs (up to 100). Repeat the flag or comma-separate values.',
      multiple: true, delimiter: ',',
    }),
    'account-id': Flags.string({
      description: 'Filter covered account GUIDs (up to 100); CHECKLY_ACCOUNT_ID selects the authenticated account. Repeat or comma-separate values.',
      multiple: true, delimiter: ',',
    }),
    'pricing-rule': Flags.string({
      description: `Select pricing rules: ${USAGE_PRICING_RULE_KEYS.join(', ')}. Repeat or comma-separate values.`,
      multiple: true, delimiter: ',',
    }),
    'check-type': Flags.string({ hidden: true, multiple: true, delimiter: ',' }),
  }
}

export function usageSeriesFlags () {
  const interval: Interfaces.OptionFlag<UsageInterval> = Flags.option({
    description: 'Aggregation interval.', options: USAGE_INTERVALS, default: 'day',
  })()
  return {
    ...usageRangeFlags(),
    ...paginationFlags(),
    interval,
    'group-by': Flags.string({
      description: 'Comma-separated account, usageTerm, pricingRule, checkType dimensions, or none for no grouping.',
      default: 'account,checkType',
    }),
    'include': Flags.string({
      description: 'Include runs and/or calculations. Repeat the flag or comma-separate values.',
      multiple: true, delimiter: ',',
    }),
  }
}

function parseDateOnly (value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  const error = new InvalidInputError(`${label} must be a valid calendar date in YYYY-MM-DD format.`)
  if (!DATE_ONLY_PATTERN.test(trimmed)) throw error
  const [year, month, day] = trimmed.split('-').map(Number)
  const parsed = new Date(0)
  parsed.setUTCFullYear(year, month - 1, day)
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw error
  }
  return trimmed
}

interface UsageDateFlags { from?: string, to?: string }
interface UsagePaginationFlags { limit: number, cursor?: string }
interface UsageTermsFlagValues extends UsageDateFlags, UsagePaginationFlags {}
interface UsageRangeFlagValues extends UsageDateFlags {
  'usage-terms-id'?: string[]
  'account-id'?: string[]
  'pricing-rule'?: string[]
  'check-type'?: string[]
}
interface UsageSeriesFlagValues extends UsageRangeFlagValues, UsagePaginationFlags {
  'interval': UsageInterval
  'group-by': string
  'include'?: string[]
}

function rangeParams (flags: UsageDateFlags): UsageDateFlags {
  const from = parseDateOnly(flags.from, '--from')
  const to = parseDateOnly(flags.to, '--to')
  if (from && to && from > to) throw new InvalidInputError('--from must be on or before --to.')
  return { from, to }
}

function cursor (value: string | undefined): string | undefined {
  if (value !== undefined && (value.length === 0 || value.length > 4096)) {
    throw new InvalidInputError('--cursor must contain between 1 and 4096 characters.')
  }
  return value
}

function parseList (values: string[] | undefined, label: string): string[] | undefined {
  if (values === undefined) return undefined
  const entries = values.flatMap(value => value.split(',').map(part => part.trim()))
  if (entries.length === 0 || entries.some(entry => entry.length === 0)) {
    throw new InvalidInputError(`${label} must not contain empty values.`)
  }
  if (entries.length > 100) throw new InvalidInputError(`${label} accepts at most 100 values.`)
  return [...new Set(entries)]
}

function parseEnum<T extends string> (value: string, options: readonly T[], label: string): T {
  const match = options.find(option => option === value)
  if (match === undefined) throw new InvalidInputError(`${label} must be one of: ${options.join(', ')}.`)
  return match
}

function enumList<T extends string> (
  values: string[] | undefined, options: readonly T[], label: string,
): T[] | undefined {
  return parseList(values, label)?.map(value => parseEnum(value, options, label))
}

export function validateUsageTermId (value: string, label = 'Usage term ID'): string {
  const trimmed = value.trim()
  if (!isUuid(trimmed)) throw new InvalidInputError(`${label} must be a valid UUID.`)
  return trimmed
}

function rejectLegacyCheckType (flags: { 'check-type'?: string[] }): void {
  if (flags['check-type'] !== undefined) {
    throw new InvalidInputError('Usage v2 does not support --check-type filtering. '
      + 'Use --pricing-rule to select charges or --group-by checkType on series for a check-type breakdown.')
  }
}

export function usageTermsParams (flags: UsageTermsFlagValues): UsageTermsParams {
  return {
    ...rangeParams(flags),
    limit: validateIntegerRange(flags.limit, '--limit', 1, 500),
    nextId: cursor(flags.cursor),
  }
}

export function usageRangeParams (flags: UsageRangeFlagValues): UsageRangeParams {
  rejectLegacyCheckType(flags)
  const accountIds = parseList(flags['account-id'], '--account-id')?.map(value => {
    if (!ACCOUNT_ID_PATTERN.test(value)) throw new InvalidInputError('--account-id must contain valid GUIDs.')
    return value
  })
  return {
    ...rangeParams(flags),
    usageTermsIds: parseList(flags['usage-terms-id'], '--usage-terms-id')?.map(value =>
      validateUsageTermId(value, '--usage-terms-id')),
    accountIds,
    pricingRuleKeys: enumList(flags['pricing-rule'], USAGE_PRICING_RULE_KEYS, '--pricing-rule'),
  }
}

export function usageSeriesParams (flags: UsageSeriesFlagValues): UsageSeriesParams {
  const groupBy = flags['group-by'].trim() === 'none'
    ? []
    : enumList([flags['group-by']], USAGE_GROUP_DIMENSIONS, '--group-by')
  return {
    ...usageRangeParams(flags),
    interval: flags.interval,
    groupBy,
    include: enumList(flags.include, USAGE_SERIES_INCLUDES, '--include'),
    limit: validateIntegerRange(flags.limit, '--limit', 1, 500),
    nextId: cursor(flags.cursor),
  }
}

export function projectionsParams (flags: { 'as-of'?: string }): UsageProjectionsParams {
  const asOf = parseDateOnly(flags['as-of'], '--as-of')
  if (asOf !== undefined && asOf >= new Date().toISOString().slice(0, 10)) {
    throw new InvalidInputError('--as-of must be a completed UTC date, before today. Defaults to yesterday UTC.')
  }
  return asOf === undefined ? {} : { asOf }
}

export async function loadUsageNames (ids: string[], period: UsagePeriod): Promise<UsageNames> {
  const terms = new Map<string, string>()
  const accounts = new Map<string, string>()
  const conflictingAccounts = new Set<string>()
  const selectedIds = new Set(ids)
  if (selectedIds.size === 0) return { terms, accounts }
  let nextId: string | undefined
  try {
    do {
      const { data: page } = await api.usage.listTerms({
        ...period, limit: 500, ...(nextId === undefined ? {} : { nextId }),
      })
      for (const term of page.data) {
        if (!selectedIds.has(term.id)) continue
        terms.set(term.id, term.name)
        for (const account of term.accounts) {
          if (conflictingAccounts.has(account.id)) continue
          const previous = accounts.get(account.id)
          if (previous !== undefined && previous !== account.name) {
            accounts.delete(account.id)
            conflictingAccounts.add(account.id)
          } else {
            accounts.set(account.id, account.name)
          }
        }
      }
      if (terms.size === selectedIds.size) break
      nextId = page.nextId ?? undefined
    } while (nextId !== undefined)
  } catch {
    // Names are optional: retain the report and any term names already loaded.
  }
  if (terms.size !== selectedIds.size) accounts.clear()
  return { terms, accounts }
}

export interface UsageErrorContext { termId?: string }

export function describeUsageError (err: unknown, context: UsageErrorContext = {}): string | Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : String(err)
  switch (err.data.code) {
    case 'NO_USAGE_TERMS':
      if (context.termId) {
        return `Usage term ${context.termId} was not found. `
          + 'Run "checkly account usage terms" to discover available term IDs.'
      }
      return 'No usage terms are available for the requested selection. '
        + 'Run "checkly account usage terms" to inspect contracts and choose term IDs or a covered date range.'
    case 'USAGE_TERMS_CONFLICT':
      return 'Selected usage terms overlap. Run "checkly account usage terms" to inspect contract dates, '
        + 'then select non-overlapping terms with --usage-terms-id or narrow the date range.'
    case 'ACCOUNT_NOT_IN_USAGE_TERMS': {
      const message = /[.!?]$/.test(err.message) ? err.message : `${err.message}.`
      return `${message} Run "checkly account usage terms" to list the accounts covered by the terms.`
    }
    case 'INVALID_CURSOR':
      return 'The --cursor value is invalid or was issued for a different query. '
        + 'Re-use the effective --from and --to dates and every filter, grouping, include, interval, and limit '
        + 'from the printed next-page command.'
    case 'INVALID_RANGE': return err.message
    case 'USAGE_STORE_UNAVAILABLE': return 'The usage store is temporarily unavailable. Try again in a few minutes.'
  }
  if (err instanceof UnauthorizedError) {
    return 'Usage reporting requires a user or service API key; legacy account API keys are not accepted.'
  }
  // Already explained where the error was made; only a bare 403 means the role lacks the permission.
  if (isAccountNotAccessible(err)) return err
  if (err instanceof ForbiddenError) return 'Usage reporting requires the usage:read permission on this account.'
  if (err instanceof NotFoundError && context.termId) return `Usage term ${context.termId} was not found.`
  return err
}
