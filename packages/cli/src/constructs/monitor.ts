import { Region } from '..'
import { AlertChannel, AlertChannelRef } from './alert-channel'
import { AlertEscalation } from './alert-escalation-policy'
import { CheckGroupRef } from './check-group-ref'
import { CheckGroupV1 } from './check-group-v1'
import { CheckGroupV2 } from './check-group-v2'
import { Frequency } from './frequency'
import { IncidentTrigger } from './incident'
import { PrivateLocation, PrivateLocationRef } from './private-location'
import {
  ExponentialRetryStrategy,
  FixedRetryStrategy,
  LinearRetryStrategy,
  NoRetriesRetryStrategy,
  SingleRetryRetryStrategy,
} from './retry-strategy'
import { Check, CheckProps } from './check'
import { Diagnostics } from './diagnostics'
import { validateUnsupportedDoubleCheck } from './internal/common-diagnostics'

/**
 * Retry strategies supported by monitors.
 */
export type MonitorRetryStrategy =
  | LinearRetryStrategy
  | ExponentialRetryStrategy
  | FixedRetryStrategy
  | SingleRetryRetryStrategy
  | NoRetriesRetryStrategy

export interface MonitorProps extends Omit<CheckProps, 'doubleCheck'> {
  /**
   *  The name of the monitor.
   */
  name: string
  /**
   *  Determines whether the monitor will run periodically or not after being deployed.
   */
  activated?: boolean
  /**
   * Determines if any notifications will be sent out when a check fails and/or recovers.
   */
  muted?: boolean
  /**
   * An array of one or more data center locations where to run this monitor.
   */
  locations?: (keyof Region)[]
  /**
   * An array of one or more private locations where to run the check.
   * PrivateLocation instances or slug name strings are allowed.
   *
   * `string` slug names are **only** allowed for private locations that do
   * **not** belong to the project. Use PrivateLocation instances for private
   * locations created within the project.
   */
  privateLocations?: (string | PrivateLocation | PrivateLocationRef)[]
  /**
   * Tags for organizing and filtering checks.
   */
  tags?: string[]
  /**
   * How often the check should run in minutes.
   */
  frequency?: number | Frequency
  /**
   * The CheckGroup that this monitor is part of.
   *
   * Note that despite their name, CheckGroups can also contain monitors.
   */
  group?: CheckGroupV1 | CheckGroupV2 | CheckGroupRef
  /**
   * List of alert channels to notify when the monitor fails or recovers.
   * If you don't set at least one, we won't be able to alert you.
   *
   * See https://www.checklyhq.com/docs/alerting-and-retries/alert-channels/#alert-channels
   * to learn more about alert channels.
   */
  alertChannels?: (AlertChannel | AlertChannelRef)[]
  /**
   * Determines the alert escalation policy for the monitor.
   */
  alertEscalationPolicy?: AlertEscalation
  /**
   * Determines whether the monitor is deployable.
   *
   * When `true`, the monitor will not be deployed, otherwise, the monitor
   * will be deployed.
   */
  testOnly?: boolean
  /**
   * Sets a retry policy for the monitor. Use RetryStrategyBuilder to create a
   * suitable retry strategy.
   *
   * @example
   * ```typescript
   * // Single retry
   * RetryStrategyBuilder.singleRetry()
   *
   * // No retries
   * RetryStrategyBuilder.noRetries()
   * ```
   */
  retryStrategy?: MonitorRetryStrategy
  /**
   * Determines whether the monitor should create and resolve an incident
   * based on its alert configuration.
   *
   * See https://www.checklyhq.com/docs/communicate/status-pages/incidents/#incident-automation
   * to learn more about automated incidents.
   */
  triggerIncident?: IncidentTrigger
}

export abstract class Monitor extends Check {
  constructor (logicalId: string, props: MonitorProps) {
    super(logicalId, props)
  }

  protected async validateDoubleCheck (diagnostics: Diagnostics): Promise<void> {
    await validateUnsupportedDoubleCheck(diagnostics, this)
  }

  synthesize () {
    return {
      ...super.synthesize(),
      doubleCheck: false,
    }
  }
}
