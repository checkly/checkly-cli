import { TracerouteMonitor, TracerouteAssertionBuilder } from 'checkly/constructs'
import { uptimeGroup } from '../utils/website-groups.check'

// Traceroute monitors map network paths and monitor routing changes to hosts.
// They're useful for monitoring network connectivity, detecting routing issues,
// and measuring hop-by-hop latency.

new TracerouteMonitor('cloudflare-dns-traceroute', {
  name: 'Cloudflare DNS Traceroute Monitor',
  activated: true,
  group: uptimeGroup,
  degradedResponseTime: 15000,
  maxResponseTime: 30000,
  request: {
    hostname: '1.1.1.1',
    port: 443,
    maxHops: 30,
    assertions: [
      TracerouteAssertionBuilder.responseTime('avg').lessThan(100),
      TracerouteAssertionBuilder.hopCount().lessThan(20),
    ]
  }
})
