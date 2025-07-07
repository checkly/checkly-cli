/* eslint-disable */
import { HeartbeatMonitor } from 'checkly/constructs'

new HeartbeatMonitor('heartbeat-monitor-1', {
  name: 'Heartbeat Monitor',
  period: 30,
  periodUnit: 'seconds',
  grace: 30,
  graceUnit: 'seconds',
  activated: true,
  muted: false,
})
