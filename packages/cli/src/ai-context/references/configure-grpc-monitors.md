# gRPC Monitor

- Import the `GrpcMonitor` construct from `checkly/constructs`.
- When adding `assertions`, always use the `GrpcAssertionBuilder` class for gRPC monitors.
- The `request` requires a `grpcConfig`. Set `grpcConfig.mode` to `'BEHAVIOR'` to invoke a `method` (the default), or `'HEALTH'` to run a gRPC health check against a `service`. Fields scoped to the other mode are ignored by the API.
- **Plan-gated properties:** `retryStrategy`, `runParallel`, and higher frequencies are not available on all plans. Check entitlements matching `UPTIME_CHECKS_*` before using these. Omit any property whose entitlement is disabled. See `npx checkly skills manage` for details.

<!-- EXAMPLE: GRPC_MONITOR -->
