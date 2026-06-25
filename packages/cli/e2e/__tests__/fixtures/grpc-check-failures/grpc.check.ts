/* eslint-disable no-new */
import { GrpcMonitor, GrpcAssertionBuilder } from 'checkly/constructs'

new GrpcMonitor('grpc-monitor-dns-failure', {
  name: 'gRPC check with DNS lookup failure',
  activated: true,
  request: {
    url: 'does-not-exist.checklyhq.com',
    port: 443,
    grpcConfig: {
      mode: 'HEALTH',
    },
  },
})

new GrpcMonitor('grpc-monitor-connection-refused', {
  name: 'gRPC check for connection that gets refused',
  activated: true,
  request: {
    url: '127.0.0.1',
    port: 12345,
    grpcConfig: {
      mode: 'HEALTH',
    },
  },
})

new GrpcMonitor('grpc-monitor-failing-assertions', {
  name: 'gRPC check with failing assertions',
  activated: true,
  request: {
    url: 'grpcb.in',
    port: 9001,
    grpcConfig: {
      mode: 'BEHAVIOR',
      tls: true,
      method: '/hello.HelloService/SayHello',
      message: '{"greeting":"Checkly"}',
    },
    assertions: [
      GrpcAssertionBuilder.statusCode().equals(99),
      GrpcAssertionBuilder.responseTime().lessThan(1),
    ],
  },
})
