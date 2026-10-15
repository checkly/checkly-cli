import type { SingleRetryRetryStrategy } from '../retry-strategy.js'

/**
 * One immediate retry, away from the location that failed: what the legacy
 * `doubleCheck` flag did. The retry strategy a check or v1 group gets when
 * neither its code nor a project or group default sets one, and the strategy
 * the backend's import format writes for a check or group that still retries
 * through the flag alone; the two change together.
 */
export const SINGLE_RETRY_ELSEWHERE: Readonly<SingleRetryRetryStrategy> = Object.freeze({
  type: 'SINGLE_RETRY',
  baseBackoffSeconds: 0,
  sameRegion: false,
})
