import { HeartbeatMonitor } from 'checkly/constructs'

const heartbeat = new HeartbeatMonitor('heartbeat-monitor-1', {
  name: 'Heartbeat Monitor',
  period: 2,
  periodUnit: 'minutes',
  grace: 30,
  graceUnit: 'seconds',
  activated: true,
  muted: false,
})
