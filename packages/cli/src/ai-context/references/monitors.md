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

## Heartbeat Monitor

- Import the `HeartbeatMonitor` construct from `checkly/constructs`.

<!-- EXAMPLE: HEARTBEAT_MONITOR -->
