import { describe, it, expect, beforeEach } from 'vitest'

// This spec locks in that the backend's CLI export templates — which emit
// `import { GrpcMonitor, SslMonitor, TracerouteMonitor } from 'checkly/constructs'`
// and the request shapes captured in p5-parity-work — compile and type-check
// against the CLI package's public construct API, and synthesize the wire
// payload the public API expects.
import { GrpcMonitor, SslMonitor, TracerouteMonitor } from '../index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

beforeEach(() => {
  Session.project = new Project('project-id', {
    name: 'Test Project',
    repoUrl: 'https://github.com/checkly/checkly-cli',
  })
})

describe('backend-style export snippets', () => {
  it('GrpcMonitor snippet compiles and synthesizes a GRPC payload', () => {
    const monitor = new GrpcMonitor('p5-parity-grpc-check', {
      name: 'p5-parity-grpc',
      activated: true,
      muted: false,
      frequency: 1,
      locations: ['us-east-1'],
      tags: ['p5-parity'],
      degradedResponseTime: 5000,
      maxResponseTime: 10000,
      request: {
        url: 'grpc.example.com',
        port: 50051,
        ipFamily: 'IPv4',
        skipSSL: false,
        timeout: 60,
        grpcConfig: {
          mode: 'BEHAVIOR',
          tls: true,
          storeResponseBody: true,
          serviceDefinition: 'REFLECTION',
          method: '/grpc.health.v1.Health/Check',
        },
      },
    })

    expect(monitor.synthesize()).toMatchObject({
      checkType: 'GRPC',
      request: {
        url: 'grpc.example.com',
        port: 50051,
        grpcConfig: { mode: 'BEHAVIOR', method: '/grpc.health.v1.Health/Check' },
      },
    })
  })

  it('SslMonitor snippet compiles and synthesizes an SSL payload', () => {
    const monitor = new SslMonitor('p5-parity-ssl-check', {
      name: 'p5-parity-ssl',
      activated: true,
      muted: false,
      frequency: 1,
      locations: ['us-east-1'],
      tags: ['p5-parity'],
      degradedResponseTime: 3000,
      maxResponseTime: 10000,
      request: {
        hostname: 'example.com',
        port: 443,
        ipFamily: 'IPv4',
        sslConfig: {
          skipChainValidation: false,
          handshakeTimeout: 10000,
          alertDaysBeforeExpiry: 20,
        },
      },
    })

    expect(monitor.synthesize()).toMatchObject({
      checkType: 'SSL',
      request: {
        sslConfig: { hostname: 'example.com', port: 443, maxResponseTimeMs: 10000 },
      },
    })
  })

  it('TracerouteMonitor snippet compiles and synthesizes a TRACEROUTE payload', () => {
    const monitor = new TracerouteMonitor('p5-parity-traceroute-check', {
      name: 'p5-parity-traceroute',
      activated: true,
      muted: false,
      frequency: 1,
      locations: ['us-east-1'],
      tags: ['p5-parity'],
      degradedResponseTime: 10000,
      maxResponseTime: 20000,
      request: {
        url: 'example.com',
        protocol: 'TCP',
        port: 443,
        ipFamily: 'IPv4',
        maxHops: 30,
        maxUnknownHops: 15,
        ptrLookup: true,
        timeout: 10,
      },
    })

    expect(monitor.synthesize()).toMatchObject({
      checkType: 'TRACEROUTE',
      request: { url: 'example.com', protocol: 'TCP', port: 443, maxHops: 30 },
    })
  })
})
