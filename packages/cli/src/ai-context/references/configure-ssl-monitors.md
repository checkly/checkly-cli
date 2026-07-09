# SSL Monitor

- Import the `SslMonitor` construct from `checkly/constructs`.
- Reference [the docs for SSL monitors](https://www.checklyhq.com/docs/constructs/ssl-monitor/) before generating any code.
- When adding `assertions`, always use `SslAssertionBuilder` class.
- The `request` object must include `hostname` (required, hostname only, no scheme) and a `sslConfig` object.
- Use `request.port` to set the port (default: 443). Use `request.ipFamily` to choose `'IPv4'` or `'IPv6'`.
- Use `sslConfig.alertDaysBeforeExpiry` to raise an alert before the certificate expires (default: 20 days).
- Use top-level `degradedResponseTime` and `maxResponseTime` (on `SslMonitorProps`) to configure TLS handshake time thresholds.
- Use `sslConfig.securityBaseline` to enforce TLS version, key size, cipher suite, and other certificate quality rules.
- For mutual TLS, set `sslConfig.clientCertificateMode` to `'auto'` or `'explicit'`. When `'explicit'`, also set `sslConfig.sslClientCertificateId`.
- **Plan-gated properties:** `retryStrategy`, `runParallel`, and higher frequencies are not available on all plans. Check entitlements matching `UPTIME_CHECKS_*` before using these. Omit any property whose entitlement is disabled. See `npx checkly skills manage` for details.

<!-- EXAMPLE: SSL_MONITOR -->
