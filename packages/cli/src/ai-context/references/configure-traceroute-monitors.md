# Traceroute Monitor

- Import the `TracerouteMonitor` construct from `checkly/constructs`.
- Reference [the docs for Traceroute monitors](https://www.checklyhq.com/docs/constructs/traceroute-monitor/) before generating any code.
- When adding `assertions`, always use `TracerouteAssertionBuilder` class.
- Response time assertions require a property parameter: `'avg'`, `'min'`, `'max'`, or `'stdDev'`.
- Use `degradedResponseTime` and `maxResponseTime` for response time thresholds (in milliseconds).
- Available assertion sources: `responseTime`, `hopCount`, `packetLoss`.

<!-- EXAMPLE: TRACEROUTE_MONITOR -->
