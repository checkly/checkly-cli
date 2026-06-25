/* eslint-disable no-new */
import { TracerouteMonitor, TracerouteAssertionBuilder } from 'checkly/constructs'

new TracerouteMonitor('traceroute-monitor-dns-failure', {
  name: 'Traceroute check with DNS lookup failure',
  activated: true,
  request: {
    url: 'does-not-exist.checklyhq.com',
  },
})

new TracerouteMonitor('traceroute-monitor-unreachable', {
  name: 'Traceroute check against an unreachable host',
  activated: true,
  request: {
    url: '192.0.2.1',
    protocol: 'ICMP',
    maxHops: 5,
  },
})

new TracerouteMonitor('traceroute-monitor-failing-assertions', {
  name: 'Traceroute check with failing assertions',
  activated: true,
  request: {
    url: '1.1.1.1',
    protocol: 'ICMP',
    assertions: [
      TracerouteAssertionBuilder.hopCount().lessThan(0),
      TracerouteAssertionBuilder.packetLoss().lessThan(0),
    ],
  },
})
