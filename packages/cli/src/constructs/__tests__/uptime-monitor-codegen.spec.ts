import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { GrpcMonitorCodegen, GrpcMonitorResource } from '../grpc-monitor-codegen.js'
import { SslMonitorCodegen, SslMonitorResource } from '../ssl-monitor-codegen.js'
import { TracerouteMonitorCodegen, TracerouteMonitorResource } from '../traceroute-monitor-codegen.js'
import { Codegen, Context } from '../internal/codegen/index.js'
import { Program } from '../../sourcegen/index.js'

interface RenderEnv {
  rootDirectory: string
  cleanup: () => Promise<void>
}

async function createRenderEnv (): Promise<RenderEnv> {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'uptime-codegen-'))
  return {
    rootDirectory,
    cleanup: () => rm(rootDirectory, { recursive: true, force: true }),
  }
}

async function renderResource<T extends { id: string }> (
  env: RenderEnv,
  makeCodegen: (program: Program) => Codegen<T>,
  resource: T,
): Promise<string> {
  const program = new Program({
    rootDirectory: env.rootDirectory,
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })

  const codegen = makeCodegen(program)
  const context = new Context()

  codegen.gencode(resource.id, resource, context)

  await program.realize()

  const [filePath] = program.paths
  if (filePath === undefined) {
    throw new Error('Codegen did not register any generated files')
  }

  return readFile(filePath, 'utf8')
}

describe('GrpcMonitorCodegen', () => {
  let env: RenderEnv
  beforeEach(async () => {
    env = await createRenderEnv()
  })
  afterEach(async () => {
    await env.cleanup()
  })

  const resource = (overrides: Partial<GrpcMonitorResource> = {}): GrpcMonitorResource => ({
    id: 'grpc-check',
    checkType: 'GRPC',
    name: 'gRPC Monitor',
    degradedResponseTime: 3000,
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
    ...overrides,
  })

  it('emits a compiling GrpcMonitor construct', async () => {
    const source = await renderResource(env, p => new GrpcMonitorCodegen(p), resource())
    expect(source).toContain('GrpcMonitor')
    expect(source).toContain('from \'checkly/constructs\'')
    expect(source).toContain('new GrpcMonitor(\'grpc-check\'')
    expect(source).toContain('url: \'grpc.example.com\'')
    expect(source).toContain('port: 50051')
    expect(source).toContain('grpcConfig: {')
    expect(source).toContain('method: \'/grpc.health.v1.Health/Check\'')
    expect(source).toContain('degradedResponseTime: 3000')
    expect(source).toContain('maxResponseTime: 10000')
  })

  it('emits assertions through GrpcAssertionBuilder', async () => {
    const source = await renderResource(env, p => new GrpcMonitorCodegen(p), resource({
      request: {
        ...resource().request,
        assertions: [
          { source: 'GRPC_STATUS_CODE', property: '', comparison: 'EQUALS', target: '0', regex: null },
          { source: 'RESPONSE_TIME', property: '', comparison: 'LESS_THAN', target: '5000', regex: null },
        ],
      },
    }))
    expect(source).toContain('GrpcAssertionBuilder')
    expect(source).toContain('statusCode()')
    expect(source).toContain('responseTime()')
  })

  it('describes the resource by name', () => {
    const program = new Program({
      rootDirectory: env.rootDirectory,
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    })
    expect(new GrpcMonitorCodegen(program).describe(resource())).toEqual('gRPC Monitor: gRPC Monitor')
  })
})

describe('SslMonitorCodegen', () => {
  let env: RenderEnv
  beforeEach(async () => {
    env = await createRenderEnv()
  })
  afterEach(async () => {
    await env.cleanup()
  })

  const resource = (overrides: Partial<SslMonitorResource> = {}): SslMonitorResource => ({
    id: 'ssl-check',
    checkType: 'SSL',
    name: 'SSL Monitor',
    degradedResponseTime: 3000,
    maxResponseTime: 10000,
    request: {
      sslConfig: {
        hostname: 'example.com',
        port: 443,
        ipFamily: 'IPv4',
        skipChainValidation: false,
        handshakeTimeoutMs: 10000,
        alertDaysBeforeExpiry: 20,
      },
    },
    ...overrides,
  })

  it('emits a compiling SslMonitor construct', async () => {
    const source = await renderResource(env, p => new SslMonitorCodegen(p), resource())
    expect(source).toContain('SslMonitor')
    expect(source).toContain('from \'checkly/constructs\'')
    expect(source).toContain('new SslMonitor(\'ssl-check\'')
    expect(source).toContain('sslConfig: {')
    // hostname/port are now top-level in request, not in sslConfig
    expect(source).toContain('hostname: \'example.com\'')
    expect(source).toContain('handshakeTimeout: 10000')
    expect(source).toContain('alertDaysBeforeExpiry: 20')
    // degradedResponseTime/maxResponseTime are now top-level props in the new shape
    expect(source).toContain('degradedResponseTime: 3000')
    expect(source).toContain('maxResponseTime: 10000')
    // Must NOT use the old wire-format names
    expect(source).not.toContain('degradedResponseTimeMs:')
    expect(source).not.toContain('maxResponseTimeMs:')
  })

  it('emits assertions through SslAssertionBuilder', async () => {
    const source = await renderResource(env, p => new SslMonitorCodegen(p), resource({
      request: {
        sslConfig: { hostname: 'example.com' },
        assertions: [
          { source: 'CERTIFICATE', property: 'daysUntilExpiry', comparison: 'GREATER_THAN', target: '20', regex: null },
          { source: 'CONNECTION', property: 'chainTrusted', comparison: 'EQUALS', target: 'true', regex: null },
        ],
      },
    }))
    expect(source).toContain('SslAssertionBuilder')
    expect(source).toContain('certificate(\'daysUntilExpiry\')')
    expect(source).toContain('connection(\'chainTrusted\')')
  })

  it('emits every SslAssertionBuilder source with its target', async () => {
    const source = await renderResource(env, p => new SslMonitorCodegen(p), resource({
      request: {
        sslConfig: { hostname: 'example.com' },
        assertions: [
          { source: 'CERTIFICATE', property: 'daysUntilExpiry', comparison: 'GREATER_THAN', target: '20', regex: null },
          { source: 'CERTIFICATE', property: 'keySizeBits', comparison: 'EQUALS', target: '2048', regex: null },
          { source: 'CERTIFICATE', property: 'signatureAlgorithm', comparison: 'EQUALS', target: 'SHA256-RSA', regex: null },
          { source: 'CERTIFICATE', property: 'issuerCN', comparison: 'CONTAINS', target: 'Example CA', regex: null },
          { source: 'CERTIFICATE', property: 'selfSigned', comparison: 'EQUALS', target: 'false', regex: null },
          { source: 'CONNECTION', property: 'tlsVersion', comparison: 'EQUALS', target: 'TLS1.3', regex: null },
          {
            source: 'CONNECTION',
            property: 'cipherSuite',
            comparison: 'EQUALS',
            target: 'TLS_AES_256_GCM_SHA384',
            regex: null,
          },
          { source: 'CONNECTION', property: 'chainTrusted', comparison: 'EQUALS', target: 'true', regex: null },
          { source: 'RESPONSE_TIME', property: '', comparison: 'LESS_THAN', target: '1000', regex: null },
          { source: 'JSON_RESPONSE', property: '$.status', comparison: 'EQUALS', target: 'ok', regex: null },
          { source: 'TEXT_RESPONSE', property: '', comparison: 'CONTAINS', target: 'healthy', regex: null },
        ],
      },
    }))
    expect(source).toContain('certificate(\'daysUntilExpiry\').greaterThan(20)')
    expect(source).toContain('certificate(\'keySizeBits\').equals(2048)')
    expect(source).toContain('certificate(\'signatureAlgorithm\').equals(\'SHA256-RSA\')')
    expect(source).toContain('certificate(\'issuerCN\').contains(\'Example CA\')')
    expect(source).toContain('certificate(\'selfSigned\').equals(false)')
    expect(source).toContain('connection(\'tlsVersion\').equals(\'TLS1.3\')')
    expect(source).toContain('connection(\'cipherSuite\').equals(\'TLS_AES_256_GCM_SHA384\')')
    expect(source).toContain('connection(\'chainTrusted\').equals(true)')
    expect(source).toContain('responseTime().lessThan(1000)')
    expect(source).toContain('jsonResponse(\'$.status\').equals(\'ok\')')
    expect(source).toContain('textResponse().contains(\'healthy\')')
  })
})

describe('TracerouteMonitorCodegen', () => {
  let env: RenderEnv
  beforeEach(async () => {
    env = await createRenderEnv()
  })
  afterEach(async () => {
    await env.cleanup()
  })

  const resource = (overrides: Partial<TracerouteMonitorResource> = {}): TracerouteMonitorResource => ({
    id: 'traceroute-check',
    checkType: 'TRACEROUTE',
    name: 'Traceroute Monitor',
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
    ...overrides,
  })

  it('emits a compiling TracerouteMonitor construct', async () => {
    const source = await renderResource(env, p => new TracerouteMonitorCodegen(p), resource())
    expect(source).toContain('TracerouteMonitor')
    expect(source).toContain('from \'checkly/constructs\'')
    expect(source).toContain('new TracerouteMonitor(\'traceroute-check\'')
    expect(source).toContain('url: \'example.com\'')
    expect(source).toContain('maxHops: 30')
    expect(source).toContain('maxUnknownHops: 15')
    expect(source).toContain('ptrLookup: true')
    expect(source).toContain('degradedResponseTime: 10000')
    expect(source).toContain('maxResponseTime: 20000')
  })

  it('drops port for ICMP probes', async () => {
    const source = await renderResource(env, p => new TracerouteMonitorCodegen(p), resource({
      request: { url: 'example.com', protocol: 'ICMP', port: 443 },
    }))
    expect(source).toContain('protocol: \'ICMP\'')
    expect(source).not.toContain('port: 443')
  })

  it('emits assertions through TracerouteAssertionBuilder', async () => {
    const source = await renderResource(env, p => new TracerouteMonitorCodegen(p), resource({
      request: {
        url: 'example.com',
        assertions: [
          { source: 'PACKET_LOSS', property: '', comparison: 'LESS_THAN', target: '10', regex: null },
        ],
      },
    }))
    expect(source).toContain('TracerouteAssertionBuilder')
    expect(source).toContain('packetLoss()')
  })
})
