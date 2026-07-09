import { TracerouteMonitor, TracerouteAssertionBuilder } from 'checkly/constructs'
import { uptimeGroup } from '../utils/website-groups.check'

// Traceroute monitors map the network path to a host and can detect routing issues,
// excessive hops, or high packet loss along the path.
// Read more: https://www.checklyhq.com/docs/traceroute-monitors/

new TracerouteMonitor('example-com-traceroute', {
  name: 'example.com Traceroute',
  activated: true,
  group: uptimeGroup,
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  request: {
    url: 'example.com',
    protocol: 'TCP',
    port: 443,
    maxHops: 30,
    assertions: [
      TracerouteAssertionBuilder.hopCount().lessThan(20),
      TracerouteAssertionBuilder.packetLoss().lessThan(10),
    ],
  },
})
