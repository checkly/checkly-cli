import { PrivateLocation, PrivateLocationRef } from './private-location'
import type { Region } from '..'
import {
  type RetryStrategy,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type RetryStrategyBuilder, // Used for @links in comments.
} from './retry-strategy'
import { AlertEscalation } from './alert-escalation-policy'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'
import { CheckGroupV1, CheckGroupV1Props } from './check-group-v1'

export interface CheckGroupV2Props extends CheckGroupV1Props {
  /**
   * Determines whether the checks in the group are running or not.
   *
   * When `true`, all checks in the group that are also activated will run.
   *
   * When `false`, no checks in the group will run, regardless of whether they
   * are activated or not.
   *
   * If not set, individual check settings are used.
   */
  activated: boolean

  /**
   * Determines if any notifications will be sent out when a check in this
   * group fails and/or recovers.
   *
   * When `true`, all checks in the group act as if they are muted, regardless
   * of their own state, and will not trigger alerts.
   *
   * When `false`, all checks in the group that are also not muted will trigger
   * alerts.
   *
   * If not set, individual check settings are used.
   */
  muted: boolean

  /**
   * Setting this to "true" will trigger a retry when a check fails from
   * the failing region and another, randomly selected region before marking
   * the check as failed.
   *
   * If set, overrides the doubleCheck property of all checks in the group.
   *
   * If not set, individual check settings are used.
   *
   * @deprecated Use {@link CheckGroupV2Props.retryStrategy} instead.
   */
  doubleCheck?: boolean

  /**
   * An array of one or more data center locations where to run the checks.
   *
   * If either {@link CheckGroupV2Props.locations} or
   * {@link CheckGroupV2Props.privateLocations} is set to a non-empty value, all
   * checks in the group will use those values instead of their own.
   */
  locations?: (keyof Region)[]

  /**
   * An array of one or more private locations where to run the checks.
   *
   * If either {@link CheckGroupV2Props.locations} or
   * {@link CheckGroupV2Props.privateLocations} is set to a non-empty value, all
   * checks in the group will use those values instead of their own.
   */
  privateLocations?: (string | PrivateLocation | PrivateLocationRef)[]

  /**
   * If set, all checks in the group will use the group's alert escalation
   * policy.
   *
   * If not set, individual check settings are used.
   */
  alertEscalationPolicy?: AlertEscalation,

  /**
   * Sets a retry policy for the group. Use {@link RetryStrategyBuilder} to
   * create a retry policy.
   *
   * If set, all checks in the group use the group's retry strategy.
   *
   * If not set, individual check settings are used.
   */
  retryStrategy?: RetryStrategy

  /**
   * Determines whether the checks in the group should run on all selected
   * locations in parallel or round-robin.
   *
   * When `true`, all checks in the group run in parallel regardless of their
   * individual setting.
   *
   * When `false`, all checks in the group run in round-robin regardless of
   * their individual setting.
   *
   * If not set, individual check settings are used.
   *
   * See https://www.checklyhq.com/docs/monitoring/global-locations/ to learn
   * more about scheduling strategies.
   */
  runParallel?: boolean
}

/**
 * Creates a Check Group (v2).
 *
 * The following properties have changed since CheckGroupV1:
 *
 *   - {@link CheckGroupV2Props.activated}
 *     - This property is now required.
 *   - {@link CheckGroupV2Props.alertEscalationPolicy}
 *     - The implicit default for this property has been removed, allowing
 *       individual check settings to take effect.
 *   - {@link CheckGroupV2Props.muted}
 *     - This property is now required.
 *   - {@link CheckGroupV2Props.retryStrategy}
 *     - The implicit default for this property has been removed, allowing
 *       individual check settings to take effect.
 *   - {@link CheckGroupV2Props.runParallel}
 *     - The implicit default for this property has been removed, allowing
 *       individual check settings to take effect.
 */
export class CheckGroupV2 extends CheckGroupV1 {
  constructor (logicalId: string, props: CheckGroupV2Props) {
    super(logicalId, props)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async onBeforeValidate (diagnostics: Diagnostics): Promise<void> {
    // No-op
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    if (this.activated !== true && this.activated !== false) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'activated',
        new Error(`A boolean value is required.`),
      ))
    }

    if (this.muted !== true && this.muted !== false) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'muted',
        new Error(`A boolean value is required.`),
      ))
    }

    super.validate(diagnostics)
  }

  synthesize() {
    return {
      ...super.synthesize(),
      v: 2,
    }
  }
}
