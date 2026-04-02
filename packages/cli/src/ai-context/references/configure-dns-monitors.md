# DNS Monitor

- Import the `DnsMonitor` construct from `checkly/constructs`.
- Reference [the docs for DNS monitors](https://www.checklyhq.com/docs/constructs/dns-monitor/) before generating any code.
- When adding `assertions`, always use `DnsAssertionBuilder` class.
- **Plan-gated properties:** `retryStrategy`, `runParallel`, and higher frequencies are not available on all plans. Check entitlements matching `UPTIME_CHECKS_*` before using these. Omit any property whose entitlement is disabled. See `npx checkly skills manage` for details.

<!-- EXAMPLE: DNS_MONITOR -->
