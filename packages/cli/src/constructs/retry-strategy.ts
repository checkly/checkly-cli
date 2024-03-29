export type RetryStrategyType = 'LINEAR' | 'EXPONENTIAL' | 'FIXED' | 'NO_RETRIES'

export interface RetryStrategy {
  type: RetryStrategyType,
  /**
  * The number of seconds to wait before the first retry attempt.
  */
  baseBackoffSeconds?: number,
  /**
  * The maximum number of attempts to retry the check. Value must be between 1 and 10.
  */
  maxRetries?: number,
  /**
  * The total amount of time to continue retrying the check (maximum 600 seconds).
  */
  maxDurationSeconds?: number,
  /**
  * Whether retries should be run in the same region as the initial check run.
  */
  sameRegion?: boolean,
}

export type RetryStrategyOptions = Pick<RetryStrategy, 'baseBackoffSeconds' | 'maxRetries' | 'maxDurationSeconds' | 'sameRegion'>

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
    }
  }
}
