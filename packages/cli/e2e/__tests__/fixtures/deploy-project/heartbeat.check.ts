/* eslint-disable */
import { HeartbeatCheck } from 'checkly/constructs'

new HeartbeatCheck('heartbeat-check-1', {
  name: 'Heartbeat Check',
  period: 30,
  periodUnit: 'seconds',
  grace: 30,
  graceUnit: 'seconds',
  activated: true,
  muted: false,
})
