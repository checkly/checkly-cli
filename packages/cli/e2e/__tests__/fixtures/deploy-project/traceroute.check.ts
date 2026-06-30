import { TracerouteMonitor } from 'checkly/constructs'

new TracerouteMonitor('traceroute-monitor', {
  name: 'Traceroute Monitor',
  activated: false,
  request: {
    url: 'example.com',
  },
})
