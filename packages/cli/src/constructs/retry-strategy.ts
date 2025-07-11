/** Available retry strategy types */
export type RetryStrategyType = 'LINEAR' | 'EXPONENTIAL' | 'FIXED' | 'SINGLE' | 'NO_RETRIES'

/**
 * Conditions can be used to limit when a retry strategy applies.
 */
export type RetryStrategyCondition = 'NETWORK_ERROR'

/**
 * Configuration for check retry behavior.
 * Defines how and when to retry failed checks before marking them as permanently failed.
 */
export interface RetryStrategy {
  /** The retry strategy type */
  type: RetryStrategyType

  /**
   * The number of seconds to wait before the first retry attempt.
   * This value is used differently based on the retry strategy type:
   * - FIXED: Same delay for all retries
   * - LINEAR: Base value that increases linearly (baseBackoffSeconds * attempt)
   * - EXPONENTIAL: Base value that increases exponentially (baseBackoffSeconds ^ attempt)
   * - SINGLE: The delay for the first and only retry
   *
   * @defaultValue 60
   * @example
   * ```typescript
   * // Fixed: 30s, 30s, 30s
   * baseBackoffSeconds: 30
   *
   * // Linear: 10s, 20s, 30s
   * baseBackoffSeconds: 10
   *
   * // Exponential: 5s, 25s, 125s
   * baseBackoffSeconds: 5
   *
   * // Single: 10s
   * baseBackoffSeconds: 10
   * ```
   */
  baseBackoffSeconds?: number

  /**
   * The maximum number of attempts to retry the check.
   * Value must be between 1 and 10.
   *
   * @defaultValue 2
   */
  maxRetries?: number

  /**
   * The total amount of time to continue retrying the check.
   * Maximum value is 600 seconds (10 minutes).
   * If retries would exceed this duration, they are stopped early.
   *
   * @defaultValue 600
   */
  maxDurationSeconds?: number

  /**
   * Whether retries should be run in the same region as the initial check run.
   * If false, retries use a randomly selected region for better fault tolerance.
   *
   * @defaultValue true
   */
  sameRegion?: boolean

  /**
   * Apply the retry strategy only if the cause of the failure matches the
   * given condition. Otherwise, do not retry.
   *
   * The following conditions are supported:
   * - NETWORK_ERROR: Retry only if the failure was caused by a network error.
   *   Available with the {@link ApiCheck} and {@link UrlMonitor} constructs.
   */
  onlyOn?: RetryStrategyCondition
}

/**
 * Options for configuring retry strategy behavior.
 * These options can be used with any retry strategy type.
 */
export type RetryStrategyOptions = Omit<RetryStrategy, 'type'>

/**
 * Configuration for single retry behavior.
 */
export interface SingleRetryStrategy extends Pick<RetryStrategy, 'baseBackoffSeconds' | 'sameRegion'> {
  type: 'SINGLE'
}

/**
 * Options for configuring single retry strategy behavior.
 */
export type SingleRetryStrategyOptions = Pick<RetryStrategyOptions, 'baseBackoffSeconds' | 'sameRegion'>

/**
 * Builder class for creating retry strategies.
 * Provides convenient methods to create different types of retry strategies.
 * Retry strategies control how and when to retry failed checks before marking them as failed.
 *
 * @example
 * ```typescript
 * // Fixed retry strategy - same delay between retries (60s, 60s, 60s)
 * const fixedRetry = RetryStrategyBuilder.fixedStrategy({
 *   maxRetries: 3,
 *   baseBackoffSeconds: 60,
 *   sameRegion: false
 * })
 *
 * // Linear retry strategy - increasing delay (10s, 20s, 30s)
 * const linearRetry = RetryStrategyBuilder.linearStrategy({
 *   maxRetries: 3,
 *   baseBackoffSeconds: 10,
 *   maxDurationSeconds: 600
 * })
 *
 * // Exponential retry strategy - exponential backoff (10s, 100s, 1000s)
 * const exponentialRetry = RetryStrategyBuilder.exponentialStrategy({
 *   maxRetries: 3,
 *   baseBackoffSeconds: 10
 * })
 *
 * // No retries - fail immediately
 * const noRetries = RetryStrategyBuilder.noRetries()
 *
 * // Retry on network errors only
 * const retryOnNetworkError = RetryStrategyBuilder.fixedStrategy({
 *   maxRetries: 1,
 *   baseBackoffSeconds: 30,
 *   sameRegion: false,
 *   onlyOn: 'NETWORK_ERROR'
 * })
 * ```
 *
 * @see {@link https://www.checklyhq.com/docs/alerting-and-retries/retries/ | Retry Strategies Documentation}
 */
export class RetryStrategyBuilder {
  private static readonly DEFAULT_BASE_BACKOFF_SECONDS = 60
  private static readonly DEFAULT_MAX_RETRIES = 2
  private static readonly DEFAULT_MAX_DURATION_SECONDS = 60 * 10
  private static readonly DEFAULT_SAME_REGION = true

  /**
   * Each retry is run with the same backoff between attempts.
   */
  static fixedStrategy (options?: RetryStrategyOptions): RetryStrategy {
    return RetryStrategyBuilder.retryStrategy('FIXED', options)
  }

  /**
   * The delay between retries increases linearly
   *
   * The delay between retries is calculated using `baseBackoffSeconds * attempt`.
   * For example, retries will be run with a backoff of 10s, 20s, 30s, and so on.
   */
  static linearStrategy (options?: RetryStrategyOptions): RetryStrategy {
    return RetryStrategyBuilder.retryStrategy('LINEAR', options)
  }

  /**
   * The delay between retries increases exponentially
   *
   * The delay between retries is calculated using `baseBackoffSeconds ^ attempt`.
   * For example, retries will be run with a backoff of 10s, 100s, 1000s, and so on.
   */
  static exponentialStrategy (options?: RetryStrategyOptions): RetryStrategy {
    return RetryStrategyBuilder.retryStrategy('EXPONENTIAL', options)
  }

  /**
   * A single retry will be performed.
   */
  static singleRetry (options?: SingleRetryStrategyOptions): RetryStrategy {
    return RetryStrategyBuilder.retryStrategy('SINGLE', {
      baseBackoffSeconds: options?.baseBackoffSeconds,
      sameRegion: options?.sameRegion,
    })
  }

  /**
   * No retries are performed.
   */
  static noRetries (): RetryStrategy {
    return RetryStrategyBuilder.retryStrategy('NO_RETRIES')
  }

  private static retryStrategy (type: RetryStrategyType, options?: RetryStrategyOptions): RetryStrategy {
    return {
      type,
      baseBackoffSeconds: options?.baseBackoffSeconds ?? RetryStrategyBuilder.DEFAULT_BASE_BACKOFF_SECONDS,
      maxRetries: options?.maxRetries ?? RetryStrategyBuilder.DEFAULT_MAX_RETRIES,
      maxDurationSeconds: options?.maxDurationSeconds ?? RetryStrategyBuilder.DEFAULT_MAX_DURATION_SECONDS,
      sameRegion: options?.sameRegion ?? RetryStrategyBuilder.DEFAULT_SAME_REGION,
      onlyOn: options?.onlyOn,
    }
  }
}
