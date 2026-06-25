/* eslint-disable no-new */
import { SslMonitor, SslAssertionBuilder } from 'checkly/constructs'

new SslMonitor('ssl-monitor-dns-failure', {
  name: 'SSL check with DNS lookup failure',
  activated: true,
  request: {
    sslConfig: {
      hostname: 'does-not-exist.checklyhq.com',
      port: 443,
    },
  },
})

new SslMonitor('ssl-monitor-expired-cert', {
  name: 'SSL check against an expired certificate',
  activated: true,
  request: {
    sslConfig: {
      hostname: 'expired.badssl.com',
      port: 443,
    },
    assertions: [
      SslAssertionBuilder.certNotExpired().equals(true),
    ],
  },
})

new SslMonitor('ssl-monitor-failing-assertions', {
  name: 'SSL check with failing assertions',
  activated: true,
  request: {
    sslConfig: {
      hostname: 'api.checklyhq.com',
      port: 443,
    },
    assertions: [
      SslAssertionBuilder.certExpiresInDays().greaterThan(100000),
      SslAssertionBuilder.tlsVersion().equals('TLS1.0'),
    ],
  },
})
