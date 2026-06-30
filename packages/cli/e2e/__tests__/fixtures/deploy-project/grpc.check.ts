import { GrpcMonitor } from 'checkly/constructs'

new GrpcMonitor('grpc-monitor', {
  name: 'gRPC Monitor',
  activated: false,
  request: {
    url: 'grpc.example.com',
    port: 50051,
    grpcConfig: {
      mode: 'HEALTH',
    },
  },
})
