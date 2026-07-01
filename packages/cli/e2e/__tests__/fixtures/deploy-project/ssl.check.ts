import { SslMonitor } from 'checkly/constructs'

new SslMonitor('ssl-monitor', {
  name: 'SSL Monitor',
  activated: false,
  request: {
    sslConfig: {
      hostname: 'example.com',
    },
  },
})
