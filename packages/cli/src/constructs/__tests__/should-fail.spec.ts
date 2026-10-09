import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AgenticCheck } from '../agentic-check.js'
import { ApiCheck } from '../api-check.js'
import { BrowserCheck } from '../browser-check.js'
import { Check } from '../check.js'
import { UnsupportedPropertyDiagnostic } from '../construct-diagnostics.js'
import { Diagnostics } from '../diagnostics.js'
import { DnsMonitor } from '../dns-monitor.js'
import { GrpcMonitor } from '../grpc-monitor.js'
import { HeartbeatMonitor } from '../heartbeat-monitor.js'
import { IcmpMonitor } from '../icmp-monitor.js'
import { MultiStepCheck } from '../multi-step-check.js'
import { PlaywrightCheck } from '../playwright-check.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import { SslMonitor } from '../ssl-monitor.js'
import { TcpMonitor } from '../tcp-monitor.js'
import { TracerouteMonitor } from '../traceroute-monitor.js'
import { UrlMonitor } from '../url-monitor.js'
import { loadSnapshot } from '../../runtimes/index.js'

// Each factory spreads `extra` into the props, so a test can set
// `shouldFail` on a construct whose props type leaves it out, the way plain
// JavaScript would.
type Factory = (extra: object) => Check

const supported: [string, Factory][] = [
  ['ApiCheck', extra => new ApiCheck('api', {
    name: 'API', request: { url: 'https://example.com', method: 'GET' }, ...extra,
  })],
  ['UrlMonitor', extra => new UrlMonitor('url', {
    name: 'URL', request: { url: 'https://example.com' }, ...extra,
  })],
  ['TcpMonitor', extra => new TcpMonitor('tcp', {
    name: 'TCP', request: { hostname: 'example.com', port: 443 }, ...extra,
  })],
]

const unsupported: [string, Factory][] = [
  ['BrowserCheck', extra => new BrowserCheck('browser', {
    name: 'Browser', code: { content: 'console.log("browser")' }, ...extra,
  })],
  ['MultiStepCheck', extra => new MultiStepCheck('multi-step', {
    name: 'MultiStep', code: { content: 'console.log("multi-step")' }, ...extra,
  })],
  ['PlaywrightCheck', extra => new PlaywrightCheck('playwright', {
    name: 'Playwright', playwrightConfigPath: path.join(os.tmpdir(), 'playwright.config.ts'), ...extra,
  })],
  ['AgenticCheck', extra => new AgenticCheck('agentic', {
    name: 'Agentic', prompt: 'Verify the homepage loads.', ...extra,
  })],
  ['DnsMonitor', extra => new DnsMonitor('dns', {
    name: 'DNS', request: { recordType: 'A', query: 'example.com' }, ...extra,
  })],
  ['IcmpMonitor', extra => new IcmpMonitor('icmp', {
    name: 'ICMP', request: { hostname: 'example.com' }, ...extra,
  })],
  ['GrpcMonitor', extra => new GrpcMonitor('grpc', {
    name: 'gRPC',
    request: {
      url: 'grpc.example.com', port: 50051, grpcConfig: { mode: 'BEHAVIOR', method: '/grpc.health.v1.Health/Check' },
    },
    ...extra,
  })],
  ['SslMonitor', extra => new SslMonitor('ssl', {
    name: 'SSL', request: { hostname: 'example.com', port: 443, sslConfig: {} }, ...extra,
  })],
  ['TracerouteMonitor', extra => new TracerouteMonitor('traceroute', {
    name: 'Traceroute', request: { url: 'example.com' }, ...extra,
  })],
  ['HeartbeatMonitor', extra => new HeartbeatMonitor('heartbeat', {
    name: 'Heartbeat', period: 1, periodUnit: 'hours', grace: 1, graceUnit: 'hours', ...extra,
  })],
]

async function shouldFailDiagnostics (check: Check): Promise<UnsupportedPropertyDiagnostic[]> {
  const diagnostics = new Diagnostics()
  await check.validate(diagnostics)
  return diagnostics.observations.filter((observation): observation is UnsupportedPropertyDiagnostic =>
    observation instanceof UnsupportedPropertyDiagnostic && observation.property === 'shouldFail')
}

describe('shouldFail', () => {
  beforeEach(async () => {
    Session.project = new Project('should-fail', { name: 'Should fail' })
    Session.availableRuntimes = await loadSnapshot()
    Session.defaultRuntimeId = '2025.04'
  })

  afterEach(() => {
    Session.reset()
  })

  describe.each(supported)('%s', (_name, create) => {
    it.each([true, false])('accepts %j', async value => {
      const check = create({ shouldFail: value })
      expect(await shouldFailDiagnostics(check)).toEqual([])
      expect(check.synthesize()).toHaveProperty('shouldFail', value)
    })

    it('takes the project default', () => {
      Session.checkDefaults = { shouldFail: true }
      expect(create({}).synthesize()).toHaveProperty('shouldFail', true)
    })
  })

  describe.each(unsupported)('%s', (_name, create) => {
    it.each([true, false])('reports %j as unsupported', async value => {
      const [diagnostic, ...rest] = await shouldFailDiagnostics(create({ shouldFail: value }))
      expect(rest).toEqual([])
      expect(diagnostic?.isFatal()).toBe(true)
      expect(diagnostic?.message).toContain('ApiCheck, UrlMonitor and TcpMonitor')
    })

    it('ignores the project default', async () => {
      Session.checkDefaults = { shouldFail: true }
      const check = create({})
      expect(await shouldFailDiagnostics(check)).toEqual([])
      expect(check.synthesize().shouldFail).toBeUndefined()
    })
  })
})
