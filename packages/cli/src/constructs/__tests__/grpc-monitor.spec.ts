import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { GrpcMonitor, GrpcRequest } from '../index.js'
import { CheckCodegen } from '../check-codegen.js'
import { GrpcMonitorResource } from '../grpc-monitor-codegen.js'
import { Context } from '../internal/codegen/context.js'
import { Program } from '../../sourcegen/index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

const request: GrpcRequest = {
  url: 'grpc.checklyhq.com',
  port: 50051,
  ipFamily: 'IPv4',
  skipSSL: false,
  timeout: 60,
  grpcConfig: {
    mode: 'BEHAVIOR',
    method: '/grpc.health.v1.Health/Check',
  },
  assertions: [],
}

describe('GrpcMonitor', () => {
  beforeEach(() => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
  })

  it('should synthesize with checkType GRPC', () => {
    const check = new GrpcMonitor('grpc-check', {
      name: 'gRPC Check',
      request,
    })
    expect(check.synthesize().checkType).toEqual('GRPC')
  })

  it('should nest the gRPC request shape under `request` (SPEC §field contracts)', () => {
    const check = new GrpcMonitor('grpc-check', {
      name: 'gRPC Check',
      request,
    })
    const synth = check.synthesize()

    // The request mirrors the public Joi `grpcRequestSchema` 1:1 — `grpcConfig`
    // is nested, NOT flattened (that flattening is Terraform-only).
    expect(Object.keys(synth.request).sort()).toEqual(
      ['url', 'port', 'ipFamily', 'skipSSL', 'timeout', 'grpcConfig', 'assertions'].sort(),
    )
    expect(synth.request.grpcConfig).toMatchObject({
      mode: 'BEHAVIOR',
      method: '/grpc.health.v1.Health/Check',
    })
    // `port` accepts number or `{{template}}` string — number passes through.
    expect(synth.request.port).toEqual(50051)
  })

  it('should keep response-time limits top-level, not inside `request`', () => {
    // Anti-pattern guard: gRPC's degraded/max response times are common monitor
    // fields (top-level), NOT request fields.
    const check = new GrpcMonitor('grpc-check', {
      name: 'gRPC Check',
      request,
      degradedResponseTime: 5000,
      maxResponseTime: 30000,
    })
    const synth = check.synthesize()

    expect(synth.degradedResponseTime).toEqual(5000)
    expect(synth.maxResponseTime).toEqual(30000)
    expect(synth.request).not.toHaveProperty('degradedResponseTime')
    expect(synth.request).not.toHaveProperty('maxResponseTime')
  })

  describe('CheckCodegen round-trip', () => {
    let rootDirectory: string

    beforeEach(async () => {
      rootDirectory = await mkdtemp(path.join(tmpdir(), 'grpc-codegen-'))
    })

    afterEach(async () => {
      await rm(rootDirectory, { recursive: true, force: true })
    })

    it('should generate code for a GrpcMonitorResource via the registered case', async () => {
      const resource: GrpcMonitorResource = {
        id: 'grpc-monitor',
        checkType: 'GRPC',
        name: 'gRPC Monitor',
        request: {
          url: 'grpc.checklyhq.com',
          port: 50051,
          grpcConfig: {
            mode: 'BEHAVIOR',
            method: '/grpc.health.v1.Health/Check',
          },
        },
        degradedResponseTime: 10000,
        maxResponseTime: 20000,
      }

      const program = new Program({
        rootDirectory,
        constructFileSuffix: '.check',
        specFileSuffix: '.spec',
        language: 'typescript',
      })
      const codegen = new CheckCodegen(program)
      const context = new Context()

      // Must not throw "Unable to generate code for unsupported check type 'GRPC'".
      expect(() => codegen.gencode(resource.id, resource, context)).not.toThrow()

      await program.realize()

      const [filePath] = program.paths
      expect(filePath).toBeDefined()
      const { readFile } = await import('node:fs/promises')
      const source = await readFile(filePath, 'utf8')
      expect(source).toContain('GrpcMonitor')
      expect(source).toContain('grpcConfig')
    })
  })
})
