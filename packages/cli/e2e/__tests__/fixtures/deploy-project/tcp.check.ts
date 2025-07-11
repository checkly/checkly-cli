/* eslint-disable no-new */
import { TcpMonitor } from 'checkly/constructs'

new TcpMonitor('tcp-monitor', {
  name: 'TCP Monitor',
  activated: false,
  request: {
    hostname: 'api.checklyhq.com',
    port: 443,
  },
  degradedResponseTime: 5000,
  maxResponseTime: 5000,
})
