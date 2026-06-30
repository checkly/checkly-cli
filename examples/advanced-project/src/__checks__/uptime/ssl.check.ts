import { SslMonitor, SslAssertionBuilder } from 'checkly/constructs'
import { uptimeGroup } from '../utils/website-groups.check'

// SSL monitors validate TLS certificates: expiry, chain trust, TLS version, and more.
// Configure alertDaysBeforeExpiry to be notified before a certificate expires.
// Read more: https://www.checklyhq.com/docs/ssl-monitors/

new SslMonitor('example-com-ssl', {
  name: 'example.com SSL Certificate',
  activated: true,
  group: uptimeGroup,
  request: {
    sslConfig: {
      hostname: 'example.com',
      port: 443,
      alertDaysBeforeExpiry: 30,
      degradedResponseTimeMs: 3000,
      maxResponseTimeMs: 10000,
    },
    assertions: [
      SslAssertionBuilder.certExpiresInDays().greaterThan(30),
      SslAssertionBuilder.chainTrusted().equals(true),
      SslAssertionBuilder.hostnameVerified().equals(true),
      SslAssertionBuilder.tlsVersion().equals('TLS1.3'),
    ],
  },
})
