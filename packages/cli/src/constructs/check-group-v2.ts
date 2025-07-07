import { PrivateLocation, PrivateLocationRef } from './private-location'
import type { Region } from '..'
import {
  type RetryStrategy,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type RetryStrategyBuilder, // Used for @links in comments.
} from './retry-strategy'
import {
  AlertEscalation,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type AlertEscalationBuilder, // Used for @links in comments.
} from './alert-escalation-policy'
import { Diagnostics } from './diagnostics'
import { CheckGroupV1, CheckGroupV1Props } from './check-group-v1'
import { validateRemovedDoubleCheck } from './internal/common-diagnostics'

export interface CheckGroupV2Props extends Omit<CheckGroupV1Props, 'alertEscalationPolicy'> {
  /**
   * This property is no longer supported; use {@link retryStrategy} instead.
   *
   * To match the behavior of `doubleCheck: true`, use:
   *
   *     retryStrategy: RetryStrategyBuilder.fixedStrategy({
   *       maxRetries: 1,
   *       baseBackoffSeconds: 0,
   *       maxDurationSeconds: 600,
   *       sameRegion: false,
   *     })
   *
   * To match the behavior of `doubleCheck: false`, use:
   *
   *     retryStrategy: RetryStrategyBuilder.noRetries()
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
   * When {@link AlertEscalation}, all checks in the group will use the
   * group's alert escalation policy. Use {@link AlertEscalationBuilder} to
   * build a suitable policy.
   *
   * When `"global"`, all checks in the group will use the global alert
   * escalation policy.
   *
   * If not set, individual check settings are used.
   */
  alertEscalationPolicy?: AlertEscalation | 'global',

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
 *   - {@link CheckGroupV2Props.alertEscalationPolicy}
 *     - The implicit default for this property has been removed, allowing
 *       individual check settings to take effect.
 *     - Can be set to `"global"` to match the earlier default behavior.
 *   - {@link CheckGroupV2Props.retryStrategy}
 *     - The implicit default for this property has been removed, allowing
 *       individual check settings to take effect.
 *   - {@link CheckGroupV2Props.runParallel}
 *     - The implicit default for this property has been removed, allowing
 *       individual check settings to take effect.
 */
export class CheckGroupV2 extends CheckGroupV1 {
  constructor (logicalId: string, props: CheckGroupV2Props) {
    const { alertEscalationPolicy, useGlobalAlertSettings } = (() => {
      const { alertEscalationPolicy } = props

      // Do we want to always use the global policy?
      if (alertEscalationPolicy === 'global') {
        return {
          alertEscalationPolicy: undefined,
          useGlobalAlertSettings: true,
        }
      }

      // Do we want to let checks keep their own policies?
      if (alertEscalationPolicy === undefined) {
        return {
          alertEscalationPolicy,
          useGlobalAlertSettings: undefined,
        }
      }

      // The group policy will always apply.
      return {
        alertEscalationPolicy,
        useGlobalAlertSettings: false,
      }
    })()

    super(logicalId, {
      ...props,
      alertEscalationPolicy,
    })

    // Must override; the V1 constructor will not give us the desired behavior.
    this.useGlobalAlertSettings = useGlobalAlertSettings
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async onBeforeValidate (diagnostics: Diagnostics): Promise<void> {
    // No-op
  }

  protected async validateDoubleCheck (diagnostics: Diagnostics): Promise<void> {
    await validateRemovedDoubleCheck(diagnostics, this)
  }

  synthesize() {
    return {
      ...super.synthesize(),
      doubleCheck: undefined,
      v: 2,
    }
  }
}
