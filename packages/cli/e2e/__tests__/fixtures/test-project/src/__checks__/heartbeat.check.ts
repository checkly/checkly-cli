import { HeartbeatCheck } from 'checkly/constructs'

const heartbeat = new HeartbeatCheck('heartbeat-check-1', {
  name: 'Heartbeat Check',
  period: 2,
  periodUnit: 'minutes',
  grace: 30,
  graceUnit: 'seconds',
  activated: true,
  muted: false,
})
