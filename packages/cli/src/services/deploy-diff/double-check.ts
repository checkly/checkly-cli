import { isDeepStrictEqual } from 'node:util'

import type { SingleRetryRetryStrategy } from '../../constructs/retry-strategy.js'

/**
 * The retry strategy that behaves as the legacy `doubleCheck` flag does: one
 * immediate retry, away from the location that failed. The import format
 * spells a check or v1 group that retries through the flag alone (no strategy
 * stored) as this strategy, since the codegen would read the stored null as
 * no retries. Mirrors the strategy the backend's import format writes; the
 * two change together.
 */
export const DOUBLE_CHECK_RETRY_STRATEGY: Readonly<SingleRetryRetryStrategy> = Object.freeze({
  type: 'SINGLE_RETRY',
  baseBackoffSeconds: 0,
  sameRegion: false,
})

function isRecord (value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Whether a check or group payload the CLI synthesized retries through the
 * flag once deployed: it sets no strategy and leaves the flag to the deploy,
 * which defaults it to `true` for checks and v1 groups. Monitors and
 * Playwright checks send `false`; a v2 group's flag defaults to `false`.
 */
export function retriesThroughDoubleCheck (type: string, payload: unknown): boolean {
  return (type === 'check' || type === 'check-group')
    && isRecord(payload)
    && payload.v !== 2
    && payload.checkType !== 'HEARTBEAT'
    && payload.retryStrategy === null
    && payload.doubleCheck !== false
}

/**
 * The deployed resource as the diff reports it. Changes are computed from the
 * stored row, which holds null where the import format holds the flag's
 * equivalent strategy. A strategy stored with exactly that shape reads the
 * same way, so a reported value is checked against both views.
 */
export function asStoredRetryStrategy (before: unknown): unknown {
  if (!isRecord(before) || before.doubleCheck !== true
    || !isDeepStrictEqual(before.retryStrategy, DOUBLE_CHECK_RETRY_STRATEGY)) {
    return before
  }
  return { ...before, retryStrategy: null }
}
