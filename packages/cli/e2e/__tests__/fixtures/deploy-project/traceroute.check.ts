import { TracerouteAssertionBuilder, TracerouteMonitor } from 'checkly/constructs'

new TracerouteMonitor('traceroute-welcome', {
  name: 'Welcome Site Traceroute',
  activated: false,
  request: {
    hostname: 'welcome.checklyhq.com',
    port: 443,
    maxHops: 30,
    assertions: [
      TracerouteAssertionBuilder.responseTime('avg').lessThan(200),
    ],
  },
  degradedResponseTime: 15000,
  maxResponseTime: 30000,
})
