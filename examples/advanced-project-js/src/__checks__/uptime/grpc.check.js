const { GrpcMonitor, GrpcAssertionBuilder } = require('checkly/constructs')
const { uptimeGroup } = require('../utils/website-groups.check')

// gRPC monitors check gRPC service health or invoke unary methods to validate responses.
// They support HEALTH mode (standard gRPC health-check) and BEHAVIOR mode (custom method calls).
// Read more: https://www.checklyhq.com/docs/grpc-monitors/

new GrpcMonitor('grpc-api-health', {
  name: 'gRPC API Health Monitor',
  activated: true,
  group: uptimeGroup,
  degradedResponseTime: 2000,
  maxResponseTime: 5000,
  request: {
    url: 'grpc.example.com',
    port: 50051,
    grpcConfig: {
      mode: 'HEALTH',
      tls: true,
    },
    assertions: [
      GrpcAssertionBuilder.healthCheckStatus().equals('SERVING'),
      GrpcAssertionBuilder.responseTime().lessThan(1000),
    ],
  },
})
