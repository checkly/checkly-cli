export type RetryStrategyType = 'LINEAR' | 'EXPONENTIAL' | 'FIXED'

export interface RetryStrategy {
  type: RetryStrategyType,
  /**
  * The number of seconds to wait before the first retry attempt.
  */
  baseBackoffSeconds?: number,
  /**
  * The maximum number of attempts to retry the check. Value must be between 1 and 10.
  */
  maxAttempts?: number,
  /**
  * The total amount of time to continue retrying the check (maximum 600 seconds).
  */
  maxDurationSeconds?: number,
  /**
  * Whether retries should be run in the same region as the initial check run.
  */
  sameRegion?: boolean,
}

export type RetryStrategyOptions = Pick<RetryStrategy, 'baseBackoffSeconds' | 'maxAttempts' | 'maxDurationSeconds' | 'sameRegion'>

export class RetryStrategyBuilder {
  private static readonly DEFAULT_BASE_BACKOFF_SECONDS = 60
  private static readonly DEFAULT_MAX_ATTEMPTS = 2
  private static readonly DEFAULT_MAX_DURATION_SECONDS = 60 * 10
  private static readonly DEFAULT_SAME_REGION = false

  /**
   * Each retry is run with the same backoff between attempts.
   */
  static fixedStrategy (options: RetryStrategyOptions): RetryStrategy {
    return RetryStrategyBuilder.retryStrategy('FIXED', options)
  }

  /**
   * The delay between retries increases linearly
   *
   * The delay between retries is calculated using `baseBackoffSeconds * attempt`.
   * For example, retries will be run with a backoff of 10s, 20s, 30s, and so on.
   */
  static linearStrategy (options: RetryStrategyOptions): RetryStrategy {
    return RetryStrategyBuilder.retryStrategy('LINEAR', options)
  }

  /**
   * The delay between retries increases exponentially
   *
   * The delay between retries is calculated using `baseBackoffSeconds ^ attempt`.
   * For example, retries will be run with a backoff of 10s, 100s, 1000s, and so on.
   */
  static exponentialStrategy (options: RetryStrategyOptions): RetryStrategy {
    return RetryStrategyBuilder.retryStrategy('EXPONENTIAL', options)
  }

  private static retryStrategy (type: RetryStrategyType, options: RetryStrategyOptions): RetryStrategy {
    return {
      type,
      baseBackoffSeconds: options.baseBackoffSeconds ?? RetryStrategyBuilder.DEFAULT_BASE_BACKOFF_SECONDS,
      maxAttempts: options.maxAttempts ?? RetryStrategyBuilder.DEFAULT_MAX_ATTEMPTS,
      maxDurationSeconds: options.maxDurationSeconds ?? RetryStrategyBuilder.DEFAULT_MAX_DURATION_SECONDS,
      sameRegion: options.sameRegion ?? RetryStrategyBuilder.DEFAULT_SAME_REGION,
    }
  }
}
