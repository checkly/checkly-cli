import { TracerouteMonitor, TracerouteAssertionBuilder } from 'checkly/constructs'
import { uptimeGroup } from '../utils/website-groups.check'

// Traceroute monitors trace the network path to a host and assert on latency,
// hop count and packet loss.
// They're useful for diagnosing routing and reachability issues.
// Note: traceroute monitors do not support private locations.
// Read more: https://www.checklyhq.com/docs/traceroute-monitors/

new TracerouteMonitor('cloudflare-traceroute-1', {
  name: 'Cloudflare DNS Traceroute Monitor',
  activated: true,
  group: uptimeGroup,
  maxResponseTime: 20000, // milliseconds
  degradedResponseTime: 10000,
  request: {
    url: '1.1.1.1',
    protocol: 'ICMP',
    maxHops: 30,
    assertions: [
      TracerouteAssertionBuilder.responseTime('avg').lessThan(2000),
      TracerouteAssertionBuilder.hopCount().lessThan(20),
      TracerouteAssertionBuilder.packetLoss().lessThan(5),
    ],
  },
})
