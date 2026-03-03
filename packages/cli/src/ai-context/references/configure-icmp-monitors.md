# ICMP Monitor

- Import the `IcmpMonitor` construct from `checkly/constructs`.
- Reference [the docs for ICMP monitors](https://www.checklyhq.com/docs/constructs/icmp-monitor/) before generating any code.
- When adding `assertions`, always use `IcmpAssertionBuilder` class.
- Latency assertions require a property parameter: `'avg'`, `'min'`, `'max'`, or `'stdDev'`.
- Use `degradedPacketLossThreshold` and `maxPacketLossThreshold` for packet loss thresholds (percentages).

<!-- EXAMPLE: ICMP_MONITOR -->
