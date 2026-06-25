import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { SslMonitor, SslRequest } from '../index.js'
import { CheckCodegen } from '../check-codegen.js'
import { SslMonitorResource } from '../ssl-monitor-codegen.js'
import { Context } from '../internal/codegen/context.js'
import { Program } from '../../sourcegen/index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

const request: SslRequest = {
  sslConfig: {
    hostname: 'acme.com',
    port: 443,
    ipFamily: 'IPv4',
    handshakeTimeoutMs: 10000,
    alertDaysBeforeExpiry: 20,
    degradedResponseTimeMs: 3000,
    maxResponseTimeMs: 10000,
  },
  assertions: [],
}

describe('SslMonitor', () => {
  beforeEach(() => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
  })

  it('should synthesize with checkType SSL', () => {
    const check = new SslMonitor('ssl-check', {
      name: 'SSL Check',
      request,
    })
    expect(check.synthesize().checkType).toEqual('SSL')
  })

  it('should nest the SSL request shape under `request` (SPEC §field contracts)', () => {
    const check = new SslMonitor('ssl-check', {
      name: 'SSL Check',
      request: {
        ...request,
        sslClientCertificateId: '6f1c8b3a-0000-4000-8000-000000000000',
      },
    })
    const synth = check.synthesize()

    // The request mirrors the public Joi `sslRequestSchema` 1:1 — the SSL config
    // is nested under `sslConfig`; `sslClientCertificateId` and `assertions` are
    // siblings of it.
    expect(Object.keys(synth.request).sort()).toEqual(
      ['sslConfig', 'sslClientCertificateId', 'assertions'].sort(),
    )
    expect(synth.request.sslConfig.hostname).toEqual('acme.com')
  })

  it('should carry response-time limits inside `request.sslConfig`, not top-level', () => {
    // Anti-pattern guard: unlike gRPC/TRACEROUTE, SSL's degraded/max response
    // times live INSIDE `sslConfig` (`degradedResponseTimeMs`/`maxResponseTimeMs`),
    // and SSL has NO top-level `degradedResponseTime`/`maxResponseTime`.
    const check = new SslMonitor('ssl-check', {
      name: 'SSL Check',
      request,
    })
    const synth = check.synthesize()

    expect(synth.request.sslConfig.degradedResponseTimeMs).toEqual(3000)
    expect(synth.request.sslConfig.maxResponseTimeMs).toEqual(10000)
    expect(synth).not.toHaveProperty('degradedResponseTime')
    expect(synth).not.toHaveProperty('maxResponseTime')
    expect(synth.request).not.toHaveProperty('degradedResponseTime')
    expect(synth.request).not.toHaveProperty('maxResponseTime')
  })

  describe('CheckCodegen round-trip', () => {
    let rootDirectory: string

    beforeEach(async () => {
      rootDirectory = await mkdtemp(path.join(tmpdir(), 'ssl-codegen-'))
    })

    afterEach(async () => {
      await rm(rootDirectory, { recursive: true, force: true })
    })

    it('should generate code for an SslMonitorResource via the registered case', async () => {
      const resource: SslMonitorResource = {
        id: 'ssl-monitor',
        checkType: 'SSL',
        name: 'SSL Monitor',
        request: {
          sslConfig: {
            hostname: 'acme.com',
            port: 443,
            degradedResponseTimeMs: 3000,
            maxResponseTimeMs: 10000,
          },
        },
      }

      const program = new Program({
        rootDirectory,
        constructFileSuffix: '.check',
        specFileSuffix: '.spec',
        language: 'typescript',
      })
      const codegen = new CheckCodegen(program)
      const context = new Context()

      // Must not throw "Unable to generate code for unsupported check type 'SSL'".
      expect(() => codegen.gencode(resource.id, resource, context)).not.toThrow()

      await program.realize()

      const [filePath] = program.paths
      expect(filePath).toBeDefined()
      const source = await readFile(filePath, 'utf8')
      expect(source).toContain('SslMonitor')
      expect(source).toContain('sslConfig')
    })
  })
})
