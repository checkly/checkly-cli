# gRPC Monitor

- Import the `GrpcMonitor` construct from `checkly/constructs`.
- Reference [the docs for gRPC monitors](https://www.checklyhq.com/docs/constructs/grpc-monitor/) before generating any code.
- When adding `assertions`, always use `GrpcAssertionBuilder` class.
- The `request` object must include a `url` (hostname only, no scheme), `port`, and a `grpcConfig` object.
- Use `grpcConfig.mode` to choose between `'BEHAVIOR'` (invoke a unary method) and `'HEALTH'` (standard health-check service).
- In `BEHAVIOR` mode, set `grpcConfig.method` (e.g. `'package.Service/Method'`). Use `grpcConfig.serviceDefinition` (`'REFLECTION'` or `'PROTO_FILE'`) to resolve the service definition.
- In `HEALTH` mode, optionally set `grpcConfig.service` to query a specific service; omit it to query overall server health.
- Use `degradedResponseTime` and `maxResponseTime` (milliseconds) to configure response time thresholds.
- **Plan-gated properties:** `retryStrategy`, `runParallel`, and higher frequencies are not available on all plans. Check entitlements matching `UPTIME_CHECKS_*` before using these. Omit any property whose entitlement is disabled. See `npx checkly skills manage` for details.

<!-- EXAMPLE: GRPC_MONITOR -->
