# Monitors

## TCP Monitor

- Import the `TcpMonitor` construct from `checkly/constructs`.
- When adding `assertions`, always use `TcpAssertionBuilder` class for TCP monitors.

<!-- EXAMPLE: TCP_MONITOR -->

## URL Monitor

- Import the `UrlMonitor` construct from `checkly/constructs`.
- When adding `assertions`, always use `UrlAssertionBuilder`.

<!-- EXAMPLE: URL_MONITOR -->

## DNS Monitor

- Import the `DnsMonitor` construct from `checkly/constructs`.
- Reference [the docs for DNS monitors](https://www.checklyhq.com/docs/constructs/dns-monitor/) before generating any code.
- When adding `assertions`, always use `DnsAssertionBuilder` class.

<!-- EXAMPLE: DNS_MONITOR -->

### ICMP Monitor

- Import the `IcmpMonitor` construct from `checkly/constructs`.
- Reference [the docs for ICMP monitors](https://www.checklyhq.com/docs/constructs/icmp-monitor/) before generating any code.
- When adding `assertions`, always use `IcmpAssertionBuilder` class.
- Latency assertions require a property parameter: `'avg'`, `'min'`, `'max'`, or `'stdDev'`.
- Use `degradedPacketLossThreshold` and `maxPacketLossThreshold` for packet loss thresholds (percentages).

<!-- EXAMPLE: ICMP_MONITOR -->

## Heartbeat Monitor

- Import the `HeartbeatMonitor` construct from `checkly/constructs`.

<!-- EXAMPLE: HEARTBEAT_MONITOR -->
