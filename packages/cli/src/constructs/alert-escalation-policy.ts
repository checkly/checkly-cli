import { expr, ident, ObjectValueBuilder, Program, Value } from '../sourcegen'
import { ArgumentsValueBuilder } from '../sourcegen/args'

// eslint-disable-next-line no-restricted-syntax
enum AlertEscalationType {
  RUN = 'RUN_BASED',
  TIME = 'TIME_BASED'
}

export type Reminders = {
  amount?: number,
  interval?: number
}

export type ParallelRunFailureThreshold = {
  enabled?: boolean,
  percentage?: number,
}

export interface AlertEscalation {
  escalationType?: AlertEscalationType,
  runBasedEscalation?: {
    failedRunThreshold?: number
  },
  timeBasedEscalation?: {
    minutesFailingThreshold?: number
  },
  reminders?: Reminders
  parallelRunFailureThreshold?: ParallelRunFailureThreshold
}

export type AlertEscalationOptions = Pick<AlertEscalation, 'runBasedEscalation' | 'timeBasedEscalation' | 'reminders' | 'parallelRunFailureThreshold'>

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

export function sourceForAlertEscalation (program: Program, escalation: AlertEscalation): Value {
  program.import('AlertEscalationBuilder', 'checkly/constructs')

  function appendCommonArguments (escalation: AlertEscalation, builder: ArgumentsValueBuilder): void {
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

  switch (escalation.escalationType as AlertEscalationType) {
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
