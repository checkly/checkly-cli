# URL Monitor

- Import the `UrlMonitor` construct from `checkly/constructs`.
- When adding `assertions`, always use `UrlAssertionBuilder`.
- **Important:** The target URL must be publicly accessible — checks run on Checkly's cloud, not locally.
- **Plan-gated properties:** `retryStrategy`, `runParallel`, and higher frequencies are not available on all plans. Check entitlements matching `UPTIME_CHECKS_*` before using these. Omit any property whose entitlement is disabled — Checkly applies safe defaults. See `npx checkly skills manage` for details.

<!-- EXAMPLE: URL_MONITOR -->
