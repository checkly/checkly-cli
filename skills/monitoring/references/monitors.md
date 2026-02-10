# Monitors

## TCP Monitor

- Import the `TcpMonitor` construct from `checkly/constructs`.
- When adding `assertions`, always use `TcpAssertionBuilder` class for TCP monitors.

**Reference:** https://www.checklyhq.com/docs/constructs/tcp-monitor/

```typescript
import { AlertEscalationBuilder, Frequency, RetryStrategyBuilder, TcpAssertionBuilder, TcpMonitor } from 'checkly/constructs'

new TcpMonitor('example-tcp-monitor', {
  name: 'Example TCP Monitor',
  degradedResponseTime: 5000,
  maxResponseTime: 5000,
  activated: true,
  locations: [
    'eu-central-1',
    'eu-west-2',
  ],
  frequency: Frequency.EVERY_1H,
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, {
    amount: 0,
    interval: 5,
  }, {
    enabled: false,
    percentage: 10,
  }),
  retryStrategy: RetryStrategyBuilder.linearStrategy({
    baseBackoffSeconds: 60,
    maxRetries: 2,
    maxDurationSeconds: 600,
    sameRegion: true,
  }),
  runParallel: true,
  request: {
    hostname: 'tcp.example.com',
    port: 4242,
    ipFamily: 'IPv4',
    assertions: [
      TcpAssertionBuilder.responseTime().lessThan(200),
      TcpAssertionBuilder.responseData().isEmpty(),
    ],
  },
})
```

## URL Monitor

- Import the `UrlMonitor` construct from `checkly/constructs`.
- When adding `assertions`, always use `UrlAssertionBuilder`.

**Reference:** https://www.checklyhq.com/docs/constructs/url-monitor/

```typescript
import { AlertEscalationBuilder, Frequency, RetryStrategyBuilder, UrlAssertionBuilder, UrlMonitor } from 'checkly/constructs'

new UrlMonitor('example-url-monitor', {
  name: 'Example URL Monitor',
  activated: true,
  locations: [
    'eu-central-1',
    'eu-west-2',
  ],
  frequency: Frequency.EVERY_5M,
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, {
    amount: 0,
    interval: 5,
  }, {
    enabled: false,
    percentage: 10,
  }),
  retryStrategy: RetryStrategyBuilder.linearStrategy({
    baseBackoffSeconds: 60,
    maxRetries: 2,
    maxDurationSeconds: 600,
    sameRegion: true,
  }),
  runParallel: true,
  degradedResponseTime: 5000,
  maxResponseTime: 20000,
  request: {
    url: 'https://example.com',
    ipFamily: 'IPv4',
    assertions: [
      UrlAssertionBuilder.statusCode().equals(200),
    ],
  },
})
```

## DNS Monitor

- Import the `DnsMonitor` construct from `checkly/constructs`.
- Reference [the docs for DNS monitors](https://www.checklyhq.com/docs/constructs/dns-monitor/) before generating any code.
- When adding `assertions`, always use `DnsAssertionBuilder` class.

**Reference:** https://www.checklyhq.com/docs/constructs/dns-monitor/

```typescript
import { AlertEscalationBuilder, DnsAssertionBuilder, DnsMonitor, Frequency, RetryStrategyBuilder } from 'checkly/constructs'

new DnsMonitor('example-dns-monitor', {
  name: 'Example DNS Monitor',
  degradedResponseTime: 500,
  maxResponseTime: 1000,
  activated: true,
  locations: [
    'eu-central-1',
    'eu-north-1',
  ],
  frequency: Frequency.EVERY_10M,
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, {
    amount: 0,
    interval: 5,
  }, {
    enabled: false,
    percentage: 10,
  }),
  retryStrategy: RetryStrategyBuilder.noRetries(),
  request: {
    recordType: 'AAAA',
    query: 'welcome.checklyhq.com',
    assertions: [
      DnsAssertionBuilder.responseCode().equals('NOERROR'),
    ],
  },
})
```

## Heartbeat Monitor

- Import the `HeartbeatMonitor` construct from `checkly/constructs`.

**Reference:** https://www.checklyhq.com/docs/constructs/heartbeat-monitor/

```typescript
import { AlertEscalationBuilder, Frequency, HeartbeatMonitor, RetryStrategyBuilder } from 'checkly/constructs'

new HeartbeatMonitor('example-heartbeat-monitor', {
  name: 'Example Heartbeat Monitor',
  period: 1,
  periodUnit: 'hours',
  grace: 30,
  graceUnit: 'minutes',
  activated: true,
  frequency: Frequency.EVERY_10S,
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, {
    amount: 0,
    interval: 5,
  }, {
    enabled: false,
    percentage: 10,
  }),
  retryStrategy: RetryStrategyBuilder.linearStrategy({
    baseBackoffSeconds: 60,
    maxRetries: 2,
    maxDurationSeconds: 600,
    sameRegion: true,
  }),
  runParallel: true,
})
```
