# Traceroute Monitor

- Import the `TracerouteMonitor` construct from `checkly/constructs`.
- When adding `assertions`, always use the `TracerouteAssertionBuilder` class for traceroute monitors. `responseTime` requires a statistical property: `avg | min | max | stdDev`.
- The `request` targets a bare host via `url` (no scheme or port). `protocol` is one of `TCP | ICMP | UDP | SCTP`; `port` is ignored for `ICMP`.
- Traceroute monitors do **not** support private locations.
- **Plan-gated properties:** `retryStrategy`, `runParallel`, and higher frequencies are not available on all plans. Check entitlements matching `UPTIME_CHECKS_*` before using these. Omit any property whose entitlement is disabled. See `npx checkly skills manage` for details.

<!-- EXAMPLE: TRACEROUTE_MONITOR -->
