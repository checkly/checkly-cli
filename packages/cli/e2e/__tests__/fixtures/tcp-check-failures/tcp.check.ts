/* eslint-disable no-new */
import { TcpCheck, TcpAssertionBuilder } from 'checkly/constructs'

new TcpCheck('tcp-check-dns-failure-ipv4', {
  name: 'TCP check with DNS lookup failure (IPv4)',
  activated: true,
  request: {
    hostname: 'does-not-exist.checklyhq.com',
    port: 443,
  },
})

new TcpCheck('tcp-check-dns-failure-ipv6', {
  name: 'TCP check with DNS lookup failure (IPv6)',
  activated: true,
  request: {
    hostname: 'does-not-exist.checklyhq.com',
    port: 443,
    ipFamily: 'IPv6',
  },
})

new TcpCheck('tcp-check-connection-refused', {
  name: 'TCP check for connection that gets refused',
  activated: true,
  request: {
    hostname: '127.0.0.1',
    port: 12345,
  },
})

new TcpCheck('tcp-check-connection-refused-2', {
  name: 'TCP check for connection that gets refused #2',
  activated: true,
  request: {
    hostname: '0.0.0.0',
    port: 12345,
  },
})

new TcpCheck('tcp-check-timed-out', {
  name: 'TCP check for connection that times out',
  activated: true,
  request: {
    hostname: 'api.checklyhq.com',
    port: 9999,
  },
})

new TcpCheck('tcp-check-failing-assertions', {
  name: 'TCP check with failing assertions',
  activated: true,
  request: {
    hostname: 'api.checklyhq.com',
    port: 80,
    data: 'GET / HTTP/1.1\r\nHost: api.checklyhq.com\r\nConnection: close\r\n\r\n',
    assertions: [
      TcpAssertionBuilder.responseData().contains('NEVER_PRESENT'),
      TcpAssertionBuilder.responseTime().lessThan(1),
    ],
  },
})

new TcpCheck('tcp-check-wrong-ip-family', {
  name: 'TCP check with wrong IP family',
  activated: true,
  request: {
    hostname: 'ipv4.google.com',
    port: 80,
    ipFamily: 'IPv6',
  },
})
