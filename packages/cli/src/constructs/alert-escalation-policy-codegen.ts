import { expr, ident, Value, ArgumentsValueBuilder, GeneratedFile } from '../sourcegen/index.js'
import { AlertEscalation } from './alert-escalation-policy.js'

export type AlertEscalationResource = AlertEscalation

/** The thresholds `AlertEscalationBuilder` fills in when a policy has none. */
const DEFAULT_FAILED_RUN_THRESHOLD = 1
const DEFAULT_MINUTES_FAILING_THRESHOLD = 5

/**
 * Whether stored alert settings describe a policy at all. The `alertSettings`
 * column defaults to an empty object, so a check or group that never set a
 * policy of its own (every one deployed on the global policy) carries `{}`,
 * which has nothing to generate and is not an escalation type to refuse.
 */
export function hasEscalationPolicy (settings: unknown): settings is AlertEscalationResource {
  return typeof settings === 'object'
    && settings !== null
    && typeof (settings as AlertEscalationResource).escalationType === 'string'
}

export function valueForAlertEscalation (genfile: GeneratedFile, escalation: AlertEscalationResource): Value {
  genfile.namedImport('AlertEscalationBuilder', 'checkly/constructs')

  function appendCommonArguments (escalation: AlertEscalationResource, builder: ArgumentsValueBuilder): void {
    if (escalation.reminders) {
      const reminders = escalation.reminders
      builder.object(builder => {
        if (reminders.amount !== undefined) {
          builder.number('amount', reminders.amount)
        }

        if (reminders.interval !== undefined) {
          builder.number('interval', reminders.interval)
        }
      })
    }

    if (escalation.parallelRunFailureThreshold) {
      const threshold = escalation.parallelRunFailureThreshold
      // The threshold is the builder's third parameter; without reminders
      // to fill the second, an `undefined` holds its place, or the builder
      // would read the threshold as the reminders.
      if (!escalation.reminders) {
        builder.undefined()
      }
      builder.object(builder => {
        if (threshold.enabled !== undefined) {
          builder.boolean('enabled', threshold.enabled)
        }

        if (threshold.percentage !== undefined) {
          builder.number('percentage', threshold.percentage)
        }
      })
    }
  }

  switch (escalation.escalationType) {
    case 'RUN_BASED':
      return expr(ident('AlertEscalationBuilder'), builder => {
        builder.member(ident('runBasedEscalation'))
        builder.call(builder => {
          // The threshold is the builder's first, required parameter; a
          // stored policy without one gets the builder's own default, so the
          // reminders after it keep their position.
          builder.number(escalation.runBasedEscalation?.failedRunThreshold ?? DEFAULT_FAILED_RUN_THRESHOLD)

          appendCommonArguments(escalation, builder)
        })
      })
    case 'TIME_BASED':
      return expr(ident('AlertEscalationBuilder'), builder => {
        builder.member(ident('timeBasedEscalation'))
        builder.call(builder => {
          builder.number(escalation.timeBasedEscalation?.minutesFailingThreshold ?? DEFAULT_MINUTES_FAILING_THRESHOLD)

          appendCommonArguments(escalation, builder)
        })
      })
    default:
      throw new Error(`Unsupported alert escalation type ${escalation.escalationType}`)
  }
}
