import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiCheck } from '../api-check.js'
import { BrowserCheck } from '../browser-check.js'
import { Check } from '../check.js'
import { CheckGroupV1 } from '../check-group-v1.js'
import { CheckGroupV2 } from '../check-group-v2.js'
import { MissingRunLocationDiagnostic } from '../construct-diagnostics.js'
import { Diagnostics } from '../diagnostics.js'
import { DnsMonitor } from '../dns-monitor.js'
import { GrpcMonitor } from '../grpc-monitor.js'
import { HeartbeatMonitor } from '../heartbeat-monitor.js'
import { IcmpMonitor } from '../icmp-monitor.js'
import { MultiStepCheck } from '../multi-step-check.js'
import { PlaywrightCheck } from '../playwright-check.js'
import { PrivateLocation } from '../private-location.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import { SslMonitor } from '../ssl-monitor.js'
import { TcpMonitor } from '../tcp-monitor.js'
import { TracerouteMonitor } from '../traceroute-monitor.js'
import { UrlMonitor } from '../url-monitor.js'
import { loadSnapshot } from '../../runtimes/index.js'

type Factory = (extra: object) => Check

const scheduled: [string, Factory][] = [
  ['ApiCheck', extra => new ApiCheck('api', {
    name: 'API', request: { url: 'https://example.com', method: 'GET' }, ...extra,
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
  ['UrlMonitor', extra => new UrlMonitor('url', {
    name: 'URL', request: { url: 'https://example.com' }, ...extra,
  })],
  ['TcpMonitor', extra => new TcpMonitor('tcp', {
    name: 'TCP', request: { hostname: 'example.com', port: 443 }, ...extra,
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
]

async function locationDiagnostics (check: Check): Promise<MissingRunLocationDiagnostic[]> {
  const diagnostics = new Diagnostics()
  await check.validate(diagnostics)
  return diagnostics.observations.filter((observation): observation is MissingRunLocationDiagnostic =>
    observation instanceof MissingRunLocationDiagnostic)
}

describe('run locations', () => {
  beforeEach(async () => {
    Session.project = new Project('run-locations', { name: 'Run locations' })
    Session.availableRuntimes = await loadSnapshot()
    Session.defaultRuntimeId = '2025.04'
    Session.warnOnMissingCheckLocations = true
  })

  afterEach(() => {
    Session.reset()
  })

  describe.each(scheduled)('%s', (_name, create) => {
    it.each([
      ['no location properties', {}],
      ['empty location lists', { locations: [], privateLocations: [] }],
    ])('warns about %s', async (_label, extra) => {
      const [diagnostic, ...rest] = await locationDiagnostics(create(extra))
      expect(rest).toEqual([])
      expect(diagnostic?.isFatal()).toBe(false)
      expect(diagnostic?.title).toBe('Check has no location')
      expect(diagnostic?.message).toBe(
        'The check has no "locations" or "privateLocations", so it will run in a location chosen by Checkly.'
        + '\n\n'
        + 'Hint: Set "locations" or "privateLocations" on the check or on its group, or set a default '
        + 'with "checks.locations" or "checks.privateLocations" in checkly.config.ts.',
      )
    })

    it('reports nothing when the command does not deploy', async () => {
      Session.warnOnMissingCheckLocations = false
      expect(await locationDiagnostics(create({}))).toEqual([])
    })

    it('accepts public locations', async () => {
      expect(await locationDiagnostics(create({ locations: ['eu-west-1'] }))).toEqual([])
    })

    it('accepts a private location slug', async () => {
      expect(await locationDiagnostics(create({ privateLocations: ['my-location'] }))).toEqual([])
    })

    it('accepts a private location construct', async () => {
      const privateLocation = new PrivateLocation('private-location', {
        name: 'Private location', slugName: 'private-location',
      })
      expect(await locationDiagnostics(create({ privateLocations: [privateLocation] }))).toEqual([])
    })

    it('accepts locations from the project defaults', async () => {
      Session.checkDefaults = { locations: ['eu-west-1'] }
      expect(await locationDiagnostics(create({}))).toEqual([])
    })

    it('accepts private locations from the project defaults', async () => {
      Session.checkDefaults = { privateLocations: ['my-location'] }
      expect(await locationDiagnostics(create({}))).toEqual([])
    })

    it('accepts a test-only check without locations', async () => {
      expect(await locationDiagnostics(create({ testOnly: true }))).toEqual([])
    })

    it.each([
      ['a CheckGroupV1 with locations', () => new CheckGroupV1('group-v1', {
        name: 'Group', locations: ['eu-west-1'],
      })],
      ['a CheckGroupV2 with locations', () => new CheckGroupV2('group-v2', {
        name: 'Group', locations: ['eu-west-1'],
      })],
      ['a CheckGroupV2 with private locations', () => new CheckGroupV2('group-v2', {
        name: 'Group', privateLocations: ['my-location'],
      })],
      ['an existing group', () => CheckGroupV2.fromId(123)],
    ])('accepts a check in %s', async (_label, createGroup) => {
      expect(await locationDiagnostics(create({ group: createGroup() }))).toEqual([])
    })

    it.each([
      ['a CheckGroupV1', () => new CheckGroupV1('group-v1', { name: 'Group' })],
      ['a CheckGroupV2', () => new CheckGroupV2('group-v2', { name: 'Group' })],
    ])('warns about a check in %s without locations', async (_label, createGroup) => {
      expect(await locationDiagnostics(create({ group: createGroup() }))).toHaveLength(1)
    })
  })

  it('does not require locations for a HeartbeatMonitor', async () => {
    const check = new HeartbeatMonitor('heartbeat', {
      name: 'Heartbeat', period: 1, periodUnit: 'hours', grace: 1, graceUnit: 'hours',
    })
    expect(await locationDiagnostics(check)).toEqual([])
  })
})
