# SSL Monitor

- Import the `SslMonitor` construct from `checkly/constructs`.
- When adding `assertions`, always use the `SslAssertionBuilder` class for SSL monitors.
- The connection details live under `request.sslConfig` (`hostname`, `port`, `alertDaysBeforeExpiry`, `degradedResponseTimeMs`/`maxResponseTimeMs`, and an optional `securityBaseline`). `maxResponseTimeMs` must be greater than or equal to `degradedResponseTimeMs`.
- **Plan-gated properties:** `retryStrategy`, `runParallel`, and higher frequencies are not available on all plans. Check entitlements matching `UPTIME_CHECKS_*` before using these. Omit any property whose entitlement is disabled. See `npx checkly skills manage` for details.

<!-- EXAMPLE: SSL_MONITOR -->
