import { SslMonitor } from 'checkly/constructs'

new SslMonitor('ssl-monitor', {
  name: 'SSL Monitor',
  activated: false,
  request: {
    hostname: 'example.com',
    sslConfig: {},
  },
})
