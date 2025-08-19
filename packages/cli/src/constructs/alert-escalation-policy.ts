/** Types of alert escalation strategies */
// eslint-disable-next-line no-restricted-syntax
enum AlertEscalationType {
  RUN = 'RUN_BASED',
  TIME = 'TIME_BASED',
}

/**
 * Configuration for alert reminders.
 * Defines how often to send reminder notifications after initial alert.
 */
export type Reminders = {
  /**
   * Number of reminder notifications to send (0 to disable, 100000 for unlimited).
   * @defaultValue 0
   * @minimum 0
   * @maximum 5
   * @enum [0, 1, 2, 3, 4, 5, 100000]
   * @example 2  // Send 2 reminder notifications
   * @example 100000  // Send unlimited reminder notifications
   */
  amount?: number

  /**
   * Interval between reminder notifications in minutes.
   * @defaultValue 5
   * @enum [5, 10, 15, 30]
   */
  interval?: number
}

/**
 * Configuration for parallel run failure threshold.
 * Determines when to alert based on percentage of failed parallel runs.
 */
export type ParallelRunFailureThreshold = {
  /**
   * Whether parallel run failure threshold is enabled.
   * @defaultValue false
   */
  enabled?: boolean

  /**
   * Percentage of runs that must fail to trigger alert.
   * @defaultValue 10
   * @minimum 10
   * @maximum 100
   * @multipleOf 10
   * @example 30  // Alert when 30% of parallel runs fail
   */
  percentage?: number
}

/**
 * Configuration for alert escalation policies.
 * Defines when and how to escalate alerts based on check failures.
 */
export interface AlertEscalation {
  /** The type of escalation strategy to use */
  escalationType?: AlertEscalationType
  /** Configuration for run-based escalation */
  runBasedEscalation?: {
    /**
     * Number of consecutive failed runs before escalating.
     * @defaultValue 1
     * @minimum 1
     * @maximum 5
     * @example 3  // Escalate after 3 consecutive failures
     */
    failedRunThreshold?: number
  }
  /** Configuration for time-based escalation */
  timeBasedEscalation?: {
    /**
     * Minutes that check must be failing before escalating.
     * @defaultValue 5
     * @enum [5, 10, 15, 30]
     * @example 10  // Escalate after 10 minutes of continuous failure
     */
    minutesFailingThreshold?: number
  }
  /** Configuration for reminder notifications */
  reminders?: Reminders
  /** Configuration for parallel run failure threshold */
  parallelRunFailureThreshold?: ParallelRunFailureThreshold
}

/**
 * Options for configuring alert escalation behavior.
 * These options can be used with any escalation strategy.
 */
export type AlertEscalationOptions = Pick<AlertEscalation, 'runBasedEscalation' | 'timeBasedEscalation' | 'reminders' | 'parallelRunFailureThreshold'>

/**
 * Builder class for creating alert escalation policies.
 * Provides convenient methods to create different types of escalation strategies.
 *
 * @example
 * ```typescript
 * // Run-based escalation - alert after 3 consecutive failures
 * const runBased = AlertEscalationBuilder.runBasedEscalation(3, {
 *   amount: 2,
 *   interval: 10
 * })
 *
 * // Time-based escalation - alert after 10 minutes of failure
 * const timeBased = AlertEscalationBuilder.timeBasedEscalation(10, {
 *   amount: 1,
 *   interval: 30
 * })
 * ```
 */
export class AlertEscalationBuilder {
  private static DEFAULT_RUN_BASED_ESCALATION = { failedRunThreshold: 1 }
  private static DEFAULT_TIME_BASED_ESCALATION = { minutesFailingThreshold: 5 }
  private static DEFAULT_REMINDERS = { amount: 0, interval: 5 }
  private static DEFAULT_PARALLEL_RUN_FAILURE_THRESHOLD = { enabled: false, percentage: 10 }

  static runBasedEscalation (
    failedRunThreshold: number,
    reminders?: Reminders,
    parallelRunFailureThreshold?: ParallelRunFailureThreshold,
  ) {
    const options: AlertEscalationOptions = {
      runBasedEscalation: {
        failedRunThreshold,
      },
      reminders,
      parallelRunFailureThreshold,
    }
    return this.alertEscalation(AlertEscalationType.RUN, options)
  }

  static timeBasedEscalation (
    minutesFailingThreshold: number,
    reminders?: Reminders,
    parallelRunFailureThreshold?: ParallelRunFailureThreshold,
  ) {
    const options: AlertEscalationOptions = {
      timeBasedEscalation: {
        minutesFailingThreshold,
      },
      reminders,
      parallelRunFailureThreshold,
    }
    return this.alertEscalation(AlertEscalationType.TIME, options)
  }

  private static alertEscalation (escalationType: AlertEscalationType,
    options: AlertEscalationOptions): AlertEscalation {
    return {
      escalationType,
      runBasedEscalation: options.runBasedEscalation ?? this.DEFAULT_RUN_BASED_ESCALATION,
      timeBasedEscalation: options.timeBasedEscalation ?? this.DEFAULT_TIME_BASED_ESCALATION,
      reminders: options.reminders ?? this.DEFAULT_REMINDERS,
      parallelRunFailureThreshold: options.parallelRunFailureThreshold ?? this.DEFAULT_PARALLEL_RUN_FAILURE_THRESHOLD,
    }
  }
}
