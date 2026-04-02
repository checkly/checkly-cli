# ICMP Monitor

- Import the `IcmpMonitor` construct from `checkly/constructs`.
- Reference [the docs for ICMP monitors](https://www.checklyhq.com/docs/constructs/icmp-monitor/) before generating any code.
- When adding `assertions`, always use `IcmpAssertionBuilder` class.
- Latency assertions require a property parameter: `'avg'`, `'min'`, `'max'`, or `'stdDev'`.
- Use `degradedPacketLossThreshold` and `maxPacketLossThreshold` for packet loss thresholds (percentages).
- **Plan-gated properties:** `retryStrategy`, `runParallel`, and higher frequencies are not available on all plans. Check entitlements matching `UPTIME_CHECKS_*` before using these. Omit any property whose entitlement is disabled. See `npx checkly skills manage` for details.

<!-- EXAMPLE: ICMP_MONITOR -->
