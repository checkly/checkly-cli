import { GrpcMonitor, GrpcAssertionBuilder } from 'checkly/constructs'
import { uptimeGroup } from '../utils/website-groups.check'

// gRPC monitors invoke a gRPC method (BEHAVIOR mode) or run a gRPC health check
// (HEALTH mode) and assert on the response, status code, metadata and timing.
// They're useful for monitoring gRPC services and APIs.
// Read more: https://www.checklyhq.com/docs/grpc-monitors/

new GrpcMonitor('hello-grpc-1', {
  name: 'gRPC Hello Monitor',
  activated: true,
  group: uptimeGroup,
  maxResponseTime: 5000, // milliseconds
  degradedResponseTime: 3000,
  request: {
    url: 'grpcb.in',
    port: 9001,
    grpcConfig: {
      mode: 'BEHAVIOR',
      tls: true,
      serviceDefinition: 'REFLECTION',
      method: '/hello.HelloService/SayHello',
      message: '{"greeting":"Checkly"}',
    },
    assertions: [
      GrpcAssertionBuilder.statusCode().equals(0),
      GrpcAssertionBuilder.response('$.reply').contains('Checkly'),
      GrpcAssertionBuilder.responseTime().lessThan(2000),
    ],
  },
})
