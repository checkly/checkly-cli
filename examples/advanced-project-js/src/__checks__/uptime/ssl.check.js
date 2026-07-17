const { SslMonitor, SslAssertionBuilder } = require('checkly/constructs')
const { uptimeGroup } = require('../utils/website-groups.check')

// SSL monitors validate TLS certificates: expiry, chain trust, TLS version, and more.
// Configure alertDaysBeforeExpiry to be notified before a certificate expires.
// Read more: https://www.checklyhq.com/docs/ssl-monitors/

new SslMonitor('example-com-ssl', {
  name: 'example.com SSL Certificate',
  activated: true,
  group: uptimeGroup,
  degradedResponseTime: 3000,
  maxResponseTime: 10000,
  request: {
    hostname: 'example.com',
    port: 443,
    sslConfig: {
      alertDaysBeforeExpiry: 30,
    },
    assertions: [
      SslAssertionBuilder.certificate('daysUntilExpiry').greaterThan(30),
      SslAssertionBuilder.connection('chainTrusted').equals(true),
      SslAssertionBuilder.connection('hostnameVerified').equals(true),
      SslAssertionBuilder.connection('tlsVersion').equals('TLS1.3'),
    ],
  },
})
