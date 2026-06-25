import { SslMonitor, SslAssertionBuilder } from 'checkly/constructs'
import { uptimeGroup } from '../utils/website-groups.check'

// SSL monitors inspect the TLS certificate and handshake of an endpoint.
// They're useful for catching certificate expiry, weak ciphers and chain-trust issues.
// Read more: https://www.checklyhq.com/docs/ssl-monitors/

new SslMonitor('checkly-ssl-1', {
  name: 'Checkly API SSL Monitor',
  activated: true,
  group: uptimeGroup,
  request: {
    sslConfig: {
      hostname: 'api.checklyhq.com',
      port: 443,
      alertDaysBeforeExpiry: 20,
      degradedResponseTimeMs: 3000,
      maxResponseTimeMs: 10000,
    },
    assertions: [
      SslAssertionBuilder.certExpiresInDays().greaterThan(14),
      SslAssertionBuilder.certNotExpired().equals(true),
      SslAssertionBuilder.tlsVersion().equals('TLS1.3'),
    ],
  },
})
