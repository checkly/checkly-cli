export type RetryStrategyType = 'LINEAR' | 'EXPONENTIAL' | 'FIXED' | 'NO_RETRIES'

export type RetryStrategyCondition = 'NETWORK_ERROR'

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
  /**
   * Apply the retry strategy only if the cause of the failure matches the
   * given condition.
   */
  onlyOn?: RetryStrategyCondition | RetryStrategyCondition[],
}

export type RetryStrategyOptions = Omit<RetryStrategy, 'type'>

export class RetryStrategyBuilder implements RetryStrategy {
  private static readonly DEFAULT_BASE_BACKOFF_SECONDS = 60
  private static readonly DEFAULT_MAX_RETRIES = 2
  private static readonly DEFAULT_MAX_DURATION_SECONDS = 60 * 10
  private static readonly DEFAULT_SAME_REGION = true

  type: RetryStrategyType
  baseBackoffSeconds?: number
  maxRetries?: number
  maxDurationSeconds?: number
  sameRegion?: boolean
  onlyOn?: RetryStrategyCondition | RetryStrategyCondition[]

  protected constructor (type: RetryStrategyType, options?: RetryStrategyOptions) {
    this.type = type
    this.baseBackoffSeconds = options?.baseBackoffSeconds ?? RetryStrategyBuilder.DEFAULT_BASE_BACKOFF_SECONDS
    this.maxRetries = options?.maxRetries ?? RetryStrategyBuilder.DEFAULT_MAX_RETRIES
    this.maxDurationSeconds = options?.maxDurationSeconds ?? RetryStrategyBuilder.DEFAULT_MAX_DURATION_SECONDS
    this.sameRegion = options?.sameRegion ?? RetryStrategyBuilder.DEFAULT_SAME_REGION
    this.onlyOn = options?.onlyOn
  }

  /**
   * Each retry is run with the same backoff between attempts.
   */
  static fixedStrategy (options?: RetryStrategyOptions): RetryStrategyBuilder {
    return new RetryStrategyBuilder('FIXED', options)
  }

  /**
   * The delay between retries increases linearly
   *
   * The delay between retries is calculated using `baseBackoffSeconds * attempt`.
   * For example, retries will be run with a backoff of 10s, 20s, 30s, and so on.
   */
  static linearStrategy (options?: RetryStrategyOptions): RetryStrategyBuilder {
    return new RetryStrategyBuilder('LINEAR', options)
  }

  /**
   * The delay between retries increases exponentially
   *
   * The delay between retries is calculated using `baseBackoffSeconds ^ attempt`.
   * For example, retries will be run with a backoff of 10s, 100s, 1000s, and so on.
   */
  static exponentialStrategy (options?: RetryStrategyOptions): RetryStrategyBuilder {
    return new RetryStrategyBuilder('EXPONENTIAL', options)
  }

  /**
   * No retries are performed.
   */
  static noRetries (): RetryStrategyBuilder {
    return new RetryStrategyBuilder('NO_RETRIES')
  }
}
