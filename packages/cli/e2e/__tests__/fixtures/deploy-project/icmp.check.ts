import { IcmpAssertionBuilder, IcmpMonitor } from 'checkly/constructs'

new IcmpMonitor('icmp-welcome', {
  name: 'Welcome Site Reachability',
  activated: false,
  request: {
    hostname: 'welcome.checklyhq.com',
    pingCount: 10,
    assertions: [
      IcmpAssertionBuilder.latency('max').lessThan(200),
    ],
  },
  degradedPacketLossThreshold: 20,
  maxPacketLossThreshold: 30,
})
