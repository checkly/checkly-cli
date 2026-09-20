import { expr, ident, Value, ArgumentsValueBuilder, GeneratedFile } from '../sourcegen/index.js'
import { AlertEscalation } from './alert-escalation-policy.js'

export type AlertEscalationResource = AlertEscalation

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
          const threshold = escalation.runBasedEscalation?.failedRunThreshold
          if (threshold !== undefined) {
            builder.number(threshold)
          }

          appendCommonArguments(escalation, builder)
        })
      })
    case 'TIME_BASED':
      return expr(ident('AlertEscalationBuilder'), builder => {
        builder.member(ident('timeBasedEscalation'))
        builder.call(builder => {
          const threshold = escalation.timeBasedEscalation?.minutesFailingThreshold
          if (threshold !== undefined) {
            builder.number(threshold)
          }

          appendCommonArguments(escalation, builder)
        })
      })
    default:
      throw new Error(`Unsupported alert escalation type ${escalation.escalationType}`)
  }
}
