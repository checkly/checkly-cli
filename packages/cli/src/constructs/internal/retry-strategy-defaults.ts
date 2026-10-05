/**
 * The values `RetryStrategyBuilder` fills in for an option left unset. They
 * live apart from the builder so the retry strategy codegen can compare a
 * stored strategy against them (an option equal to its default is left out
 * of generated code, since the builder puts it back) without exporting
 * anything new from the constructs' public surface.
 */
export const RETRY_STRATEGY_DEFAULTS = {
  baseBackoffSeconds: 60,
  maxRetries: 2,
  maxDurationSeconds: 60 * 10,
  sameRegion: true,
} as const
