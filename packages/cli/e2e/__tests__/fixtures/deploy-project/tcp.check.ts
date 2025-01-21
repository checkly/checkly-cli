/* eslint-disable no-new */
import { TcpCheck } from 'checkly/constructs'

new TcpCheck('tcp-check', {
  name: 'TCP Check',
  activated: false,
  request: {
    hostname: 'api.checklyhq.com',
    port: 443,
  },
  degradedResponseTime: 5000,
  maxResponseTime: 20000,
})
