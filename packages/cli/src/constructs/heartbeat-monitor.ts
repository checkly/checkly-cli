import { Monitor, MonitorProps } from './monitor'
import { Session } from './project'
import { DateTime } from 'luxon'
import CheckTypes from '../constants'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'

type TimeUnits = 'seconds' | 'minutes' | 'hours' | 'days'

export interface Heartbeat {
  /**
   * The expected period of time between each ping. Between 30 seconds and 365 days.
   */
  period: number
  /**
   * The unit of time for the period.
   */
  periodUnit: TimeUnits
  /**
   * The grace period to wait for before sending an alert. Between 0 seconds and 365 days.
   */
  grace: number
  /*
    * The unit of time for the grace period.
   */
  graceUnit: TimeUnits
}

export interface HeartbeatMonitorProps extends MonitorProps {
  period: number
  periodUnit: TimeUnits
  grace: number
  graceUnit: TimeUnits
}


/**
 * Creates a Heartbeat Monitor
 */
export class HeartbeatMonitor extends Monitor {
  heartbeat: Heartbeat

  /**
   * Constructs the Heartbeat Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#heartbeatmonitor Read more in the docs}
   */
  constructor (logicalId: string, props: HeartbeatMonitorProps) {
    super(logicalId, props)

    this.heartbeat = {
      period: props.period,
      periodUnit: props.periodUnit,
      grace: props.grace,
      graceUnit: props.graceUnit,
    }

    Session.registerConstruct(this)
    this.addSubscriptions()
  }

  describe (): string {
    return `HeartbeatMonitor:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    // Validate time units
    const validTimeUnits = ['seconds', 'minutes', 'hours', 'days']
    let unitsValid = true

    if (!validTimeUnits.includes(this.heartbeat.periodUnit)) {
      unitsValid = false
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'periodUnit',
        new Error(`Invalid time unit "${this.heartbeat.periodUnit}". Valid units are: ${validTimeUnits.join(', ')}`),
      ))
    }

    if (!validTimeUnits.includes(this.heartbeat.graceUnit)) {
      unitsValid = false
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'graceUnit',
        new Error(`Invalid time unit "${this.heartbeat.graceUnit}". Valid units are: ${validTimeUnits.join(', ')}`),
      ))
    }

    // Only validate period and grace values if units are valid
    if (unitsValid) {
      const now = DateTime.now()
      const addedTimePeriod = now.plus({ [this.heartbeat.periodUnit]: this.heartbeat.period })
      const addedGracePeriod = now.plus({ [this.heartbeat.graceUnit]: this.heartbeat.grace })

      const MAX_PERIOD_GRACE_DAYS = 365
      const MIN_PERIOD_SECONDS = 30

      const periodDiffDays = addedTimePeriod.diff(now, 'days').days
      const periodDiffSeconds = addedTimePeriod.diff(now, 'seconds').seconds

      if (periodDiffDays > MAX_PERIOD_GRACE_DAYS) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'period',
          new Error(`Period must not exceed 365 days. Current value: ${this.heartbeat.period} ${this.heartbeat.periodUnit} (${periodDiffDays.toFixed(2)} days)`),
        ))
      }

      if (periodDiffSeconds < MIN_PERIOD_SECONDS) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'period',
          new Error(`Period must be at least 30 seconds. Current value: ${this.heartbeat.period} ${this.heartbeat.periodUnit} (${periodDiffSeconds} seconds)`),
        ))
      }

      const graceDiffDays = addedGracePeriod.diff(now, 'days').days
      if (graceDiffDays > MAX_PERIOD_GRACE_DAYS) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'grace',
          new Error(`Grace period must not exceed 365 days. Current value: ${this.heartbeat.grace} ${this.heartbeat.graceUnit} (${graceDiffDays.toFixed(2)} days)`),
        ))
      }

      // Validate grace is not negative
      if (addedGracePeriod.diff(now, 'seconds').seconds < 0) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'grace',
          new Error(`Grace period must be 0 or greater. Current value: ${this.heartbeat.grace} ${this.heartbeat.graceUnit}`),
        ))
      }
    }
  }

  synthesize (): any | null {
    return {
      ...super.synthesize(),
      checkType: CheckTypes.HEARTBEAT,
      heartbeat: this.heartbeat,
    }
  }
}

// Aliases for backwards compatibility.
export {
  HeartbeatMonitorProps as HeartbeatCheckProps,
  HeartbeatMonitor as HeartbeatCheck,
}
