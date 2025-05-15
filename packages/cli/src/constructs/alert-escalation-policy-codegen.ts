import { expr, ident, Value, ArgumentsValueBuilder, GeneratedFile } from '../sourcegen'
import { AlertEscalation } from './alert-escalation-policy'

export type AlertEscalationResource = AlertEscalation

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
