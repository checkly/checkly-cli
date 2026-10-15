import { isDeepStrictEqual } from 'node:util'

import { SINGLE_RETRY_ELSEWHERE } from '../../constructs/internal/default-retry-strategy.js'

function isRecord (value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The deployed resource as the diff reports it. A check or v1 group that
 * still retries through the legacy `doubleCheck` flag alone stores a null
 * strategy, which the import format spells as `SINGLE_RETRY_ELSEWHERE`;
 * changes are computed from the stored row. A strategy stored with exactly
 * that shape reads the same way, so a reported value is checked against both
 * views.
 */
export function asStoredRetryStrategy (before: unknown): unknown {
  if (!isRecord(before) || before.doubleCheck !== true
    || !isDeepStrictEqual(before.retryStrategy, SINGLE_RETRY_ELSEWHERE)) {
    return before
  }
  return { ...before, retryStrategy: null }
}
