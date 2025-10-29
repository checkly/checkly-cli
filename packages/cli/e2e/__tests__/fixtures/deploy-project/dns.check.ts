import { DnsAssertionBuilder, DnsMonitor } from 'checkly/constructs'

new DnsMonitor('dns-welcome-a', {
  name: 'Welcome A Record',
  activated: false,
  request: {
    query: 'welcome.checklyhq.com',
    recordType: 'A',
    assertions: [
      DnsAssertionBuilder.responseCode().equals('NOERROR'),
    ],
  },
})

new DnsMonitor('dns-welcome-aaaa', {
  name: 'Welcome AAAA Record',
  activated: false,
  request: {
    query: 'welcome.checklyhq.com',
    recordType: 'AAAA',
    assertions: [
      DnsAssertionBuilder.responseCode().equals('NOERROR'),
    ],
  },
})

new DnsMonitor('dns-nonexistent-all-assertion-types', {
  name: 'Nonexistent A Record',
  activated: false,
  request: {
    query: 'nonexistent.checklyhq.com',
    recordType: 'A',
    assertions: [
      DnsAssertionBuilder.responseCode().equals('NXDOMAIN'),
      DnsAssertionBuilder.responseTime().lessThan(1000),
      DnsAssertionBuilder.textAnswer('opcode: ([A-Z]+)').equals('QUERY'),
      DnsAssertionBuilder.jsonAnswer('$.Answer[0].data').isEmpty(),
    ],
  },
})
