import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { TracerouteMonitor, TracerouteRequest } from '../index.js'
import { CheckCodegen } from '../check-codegen.js'
import { TracerouteMonitorResource } from '../traceroute-monitor-codegen.js'
import { Context } from '../internal/codegen/context.js'
import { Program } from '../../sourcegen/index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

const request: TracerouteRequest = {
  url: 'acme.com',
  protocol: 'TCP',
  port: 443,
  ipFamily: 'IPv4',
  maxHops: 30,
  maxUnknownHops: 15,
  ptrLookup: true,
  timeout: 10,
  assertions: [],
}

describe('TracerouteMonitor', () => {
  beforeEach(() => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
  })

  it('should synthesize with checkType TRACEROUTE', () => {
    const check = new TracerouteMonitor('traceroute-check', {
      name: 'Traceroute Check',
      request,
    })
    expect(check.synthesize().checkType).toEqual('TRACEROUTE')
  })

  it('should carry the traceroute request shape under `request` (SPEC §field contracts)', () => {
    const check = new TracerouteMonitor('traceroute-check', {
      name: 'Traceroute Check',
      request,
    })
    const synth = check.synthesize()

    // The request mirrors the public Joi `tracerouteMonitorCreateSchema` request
    // 1:1 (flat — no nested config sub-object).
    expect(Object.keys(synth.request).sort()).toEqual(
      ['url', 'protocol', 'port', 'ipFamily', 'maxHops', 'maxUnknownHops', 'ptrLookup', 'timeout', 'assertions'].sort(),
    )
    expect(synth.request.url).toEqual('acme.com')
    expect(synth.request.maxHops).toEqual(30)
  })

  it('should keep response-time limits top-level, not inside `request`', () => {
    // Anti-pattern guard: TRACEROUTE's degraded/max response times are common
    // monitor fields (top-level, spread from `tracerouteResponseTimeLimitFields`),
    // NOT request fields.
    const check = new TracerouteMonitor('traceroute-check', {
      name: 'Traceroute Check',
      request,
      degradedResponseTime: 10000,
      maxResponseTime: 20000,
    })
    const synth = check.synthesize()

    expect(synth.degradedResponseTime).toEqual(10000)
    expect(synth.maxResponseTime).toEqual(20000)
    expect(synth.request).not.toHaveProperty('degradedResponseTime')
    expect(synth.request).not.toHaveProperty('maxResponseTime')
  })

  describe('CheckCodegen round-trip', () => {
    let rootDirectory: string

    beforeEach(async () => {
      rootDirectory = await mkdtemp(path.join(tmpdir(), 'traceroute-codegen-'))
    })

    afterEach(async () => {
      await rm(rootDirectory, { recursive: true, force: true })
    })

    it('should generate code for a TracerouteMonitorResource via the registered case', async () => {
      const resource: TracerouteMonitorResource = {
        id: 'traceroute-monitor',
        checkType: 'TRACEROUTE',
        name: 'Traceroute Monitor',
        request: {
          url: 'acme.com',
          protocol: 'TCP',
          port: 443,
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

      // Must not throw "Unable to generate code for unsupported check type 'TRACEROUTE'".
      expect(() => codegen.gencode(resource.id, resource, context)).not.toThrow()

      await program.realize()

      const [filePath] = program.paths
      expect(filePath).toBeDefined()
      const source = await readFile(filePath, 'utf8')
      expect(source).toContain('TracerouteMonitor')
      expect(source).toContain('url')
    })
  })
})
