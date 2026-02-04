const { IcmpMonitor, IcmpAssertionBuilder } = require('checkly/constructs')
const { uptimeGroup } = require('../utils/website-groups.check')

// ICMP monitors check if a host is reachable by sending ICMP echo requests (pings).
// They're useful for monitoring network connectivity and measuring latency to hosts.
// Read more: https://www.checklyhq.com/docs/icmp-monitors/

new IcmpMonitor('cloudflare-dns-icmp', {
  name: 'Cloudflare DNS ICMP Monitor',
  activated: true,
  group: uptimeGroup,
  maxPacketLossThreshold: 20, // percentage
  degradedPacketLossThreshold: 10,
  request: {
    hostname: '1.1.1.1',
    pingCount: 10,
    assertions: [
      IcmpAssertionBuilder.latency('avg').lessThan(100),
      IcmpAssertionBuilder.latency('max').lessThan(200),
    ]
  }
})
