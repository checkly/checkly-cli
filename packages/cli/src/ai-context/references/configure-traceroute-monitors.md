# Traceroute Monitor

- Import the `TracerouteMonitor` construct from `checkly/constructs`.
- Reference [the docs for Traceroute monitors](https://www.checklyhq.com/docs/constructs/traceroute-monitor/) before generating any code.
- When adding `assertions`, always use `TracerouteAssertionBuilder` class.
- The `request` object must include a `url` field (hostname only, no scheme or port).
- Use `request.protocol` to choose the probe protocol: `'TCP'` (default), `'UDP'`, `'ICMP'`, or `'SCTP'`.
- Use `request.maxHops` (default: 30) and `request.maxUnknownHops` (default: 15) to control trace depth.
- Use `degradedResponseTime` and `maxResponseTime` (milliseconds) to configure response time thresholds.
- Traceroute assertions support `RESPONSE_TIME`, `HOP_COUNT`, and `PACKET_LOSS` sources.
- `TracerouteAssertionBuilder.responseTime()` takes an optional property — `'avg'` (default), `'min'`, `'max'`, or `'stdDev'`. `hopCount()` and `packetLoss()` take no property.
- **Plan-gated properties:** `retryStrategy`, `runParallel`, and higher frequencies are not available on all plans. Check entitlements matching `UPTIME_CHECKS_*` before using these. Omit any property whose entitlement is disabled. See `npx checkly skills manage` for details.

<!-- EXAMPLE: TRACEROUTE_MONITOR -->
