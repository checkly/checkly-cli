import { Check, CheckProps } from './check'
import { Session } from './project'
import { DateTime } from 'luxon'
import CheckTypes from '../constants'

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

export interface HeartbeatCheckProps extends CheckProps {
  period: number
  periodUnit: TimeUnits
  grace: number
  graceUnit: TimeUnits
}

function _customPeriodGraceValidation (heartbeat: Heartbeat) {
  const now = DateTime.now()
  const addedTimePeriod = now.plus({ [heartbeat.periodUnit]: heartbeat.period })
  const addedGracePeriod = now.plus({ [heartbeat.graceUnit]: heartbeat.grace })

  const MAX_PERIOD_GRACE_DAYS = 365
  const MIN_PERIOD_SECONDS = 30

  if (
    addedTimePeriod.diff(now, 'days').days > MAX_PERIOD_GRACE_DAYS ||
    addedTimePeriod.diff(now, 'seconds').seconds < MIN_PERIOD_SECONDS
  ) {
    throw new Error('Period must be between 30 seconds and 365 days.')
  }

  if (addedGracePeriod.diff(now, 'days').days > MAX_PERIOD_GRACE_DAYS) {
    throw new Error('Grace must be less than 366 days.')
  }
}

/**
 * Creates a Heartbeat Check
 *
 * @remarks
 *
 * This class make use of the Heartbeat Checks endpoints.
 */
export class HeartbeatCheck extends Check {
  heartbeat: Heartbeat

  /**
   * Constructs the Heartbeat Check instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props heartbeat check configuration properties
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#heartbeat Read more in the docs}
   */
  constructor (logicalId: string, props: HeartbeatCheckProps) {
    super(logicalId, props)

    _customPeriodGraceValidation(props)
    this.heartbeat = {
      period: props.period,
      periodUnit: props.periodUnit,
      grace: props.grace,
      graceUnit: props.graceUnit,
    }

    Session.registerConstruct(this)
    this.addSubscriptions()
  }

  synthesize (): any | null {
    return {
      ...super.synthesize(),
      checkType: CheckTypes.HEARTBEAT,
      heartbeat: this.heartbeat,
    }
  }
}
