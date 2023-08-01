import { Check, CheckProps } from './check'
import { Session } from './project'
import { DateTime } from 'luxon'

type TimeUnits = 'seconds' | 'minutes' | 'hours' | 'days'

export interface Heartbeat {
  period: number
  periodUnit: TimeUnits
  grace: number
  graceUnit: TimeUnits
}

export interface HeartbeatCheckProps extends CheckProps {
  period: number
  periodUnit: TimeUnits
  grace: number
  graceUnit: TimeUnits
}

function _customPeriodGraceValidation (period: number, periodUnit: TimeUnits, grace: number, graceUnit: TimeUnits) {
  const now = DateTime.now()
  const addedTimePeriod = now.plus({ [periodUnit]: period })
  const addedGracePeriod = now.plus({ [graceUnit]: grace })

  const MAX_PERIOD_GRACE_DAYS = 365
  const MIN_PERIOD_SECONDS = 30

  if (
    addedTimePeriod.diff(now, 'days').days > MAX_PERIOD_GRACE_DAYS ||
    addedTimePeriod.diff(now, 'seconds').seconds < MIN_PERIOD_SECONDS
  ) {
    throw new Error('Period must be between 30 seconds and 365 days.')
  }

  if (addedGracePeriod.diff(now, 'days').days > MAX_PERIOD_GRACE_DAYS) {
    throw new Error('Grace must be less than 365 days.')
  }
}

export class HeartbeatCheck extends Check {
  heartbeat: Heartbeat

  constructor (logicalId: string, props: HeartbeatCheckProps) {
    super(logicalId, props)

    _customPeriodGraceValidation(props.period, props.periodUnit, props.grace, props.graceUnit)
    this.heartbeat = {
      period: props.period,
      periodUnit: props.periodUnit,
      grace: props.grace,
      graceUnit: props.graceUnit,
    }

    Session.registerConstruct(this)
  }

  synthesize (): any | null {
    return {
      ...super.synthesize(),
      checkType: 'HEARTBEAT',
      heartbeat: this.heartbeat,
    }
  }
}
