import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiCheck } from '../api-check.js'
import { BrowserCheck } from '../browser-check.js'
import { Check } from '../check.js'
import { CheckGroupV2 } from '../check-group-v2.js'
import { RemovedPropertyDiagnostic } from '../construct-diagnostics.js'
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

// Each factory spreads `extra` into the props, so a test can pass a
// property the props type leaves out, the way plain JavaScript would.
type Factory = (extra: object) => Check

const constructs: [string, Factory][] = [
  ['ApiCheck', extra => new ApiCheck('api', {
    name: 'API', request: { url: 'https://example.com', method: 'GET' }, ...extra,
  })],
  ['UrlMonitor', extra => new UrlMonitor('url', {
    name: 'URL', request: { url: 'https://example.com' }, ...extra,
  })],
  ['TcpMonitor', extra => new TcpMonitor('tcp', {
    name: 'TCP', request: { hostname: 'example.com', port: 443 }, ...extra,
  })],
  ['BrowserCheck', extra => new BrowserCheck('browser', {
    name: 'Browser', code: { content: 'console.log("browser")' }, ...extra,
  })],
  ['MultiStepCheck', extra => new MultiStepCheck('multi-step', {
    name: 'MultiStep', code: { content: 'console.log("multi-step")' }, ...extra,
  })],
  ['PlaywrightCheck', extra => new PlaywrightCheck('playwright', {
    name: 'Playwright', playwrightConfigPath: path.join(os.tmpdir(), 'playwright.config.ts'), ...extra,
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

async function removedDiagnostics (check: Check, property: string): Promise<RemovedPropertyDiagnostic[]> {
  const diagnostics = new Diagnostics()
  await check.validate(diagnostics)
  return diagnostics.observations.filter((observation): observation is RemovedPropertyDiagnostic =>
    observation instanceof RemovedPropertyDiagnostic && observation.property === property)
}

describe('removed group properties', () => {
  let group: CheckGroupV2

  beforeEach(async () => {
    Session.project = new Project('removed-group-props', { name: 'Removed group props' })
    Session.availableRuntimes = await loadSnapshot()
    Session.defaultRuntimeId = '2025.04'
    group = new CheckGroupV2('group', { name: 'Group' })
  })

  afterEach(() => {
    Session.reset()
  })

  describe.each(constructs)('%s', (_name, create) => {
    it('reports groupId as removed and does not apply it', async () => {
      const check = create({ groupId: group.ref() })
      const [diagnostic, ...rest] = await removedDiagnostics(check, 'groupId')
      expect(rest).toEqual([])
      expect(diagnostic?.isFatal()).toBe(true)
      expect(diagnostic?.message).toContain('group: myGroup')
      expect(check.groupId).toBeUndefined()
    })

    it('accepts group', async () => {
      const check = create({ group })
      expect(await removedDiagnostics(check, 'groupId')).toEqual([])
      expect(check.groupId).toEqual(group.ref())
    })
  })

  describe('PlaywrightCheck groupName', () => {
    const create = constructs.find(([name]) => name === 'PlaywrightCheck')![1]

    it('reports groupName as removed and does not apply it', async () => {
      const check = create({ groupName: 'Group' })
      const [diagnostic, ...rest] = await removedDiagnostics(check, 'groupName')
      expect(rest).toEqual([])
      expect(diagnostic?.isFatal()).toBe(true)
      expect(diagnostic?.message).toContain('group: myGroup')
      expect(check.groupId).toBeUndefined()
    })

    it('does not report group', async () => {
      const check = create({ group })
      expect(await removedDiagnostics(check, 'groupName')).toEqual([])
    })
  })
})
