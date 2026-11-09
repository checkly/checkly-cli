import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as constructs from '../index.js'
import { ApiCheck } from '../api-check.js'
import { BrowserCheck } from '../browser-check.js'
import { Check } from '../check.js'
import { CheckGroupV1 } from '../check-group-v1.js'
import { CheckGroupV2 } from '../check-group-v2.js'
import { InvalidPropertyValueDiagnostic } from '../construct-diagnostics.js'
import { Construct } from '../construct.js'
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
import type { Region } from '../../index.js'
import type { CheckConfigDefaults } from '../../services/checkly-config-loader.js'

/**
 * `me-south-1` is no longer a key of `Region`, but a JavaScript project or a
 * cast can still pass it. The factories take an untyped `extra`.
 */
const RETIRED = ['me-south-1']
const RETIRED_AND_VALID = ['me-south-1', 'eu-central-1']

function retiredDefaults (): CheckConfigDefaults {
  return { locations: RETIRED as unknown as Array<keyof Region> }
}

const MESSAGE = 'Location "me-south-1" (Bahrain) is retired and can no longer run checks. Choose another location.'

type Factory = (extra: object) => Check

/** Cloned from run-locations.spec.ts. */
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

const groups: [string, (extra: object) => CheckGroupV1][] = [
  ['CheckGroupV1', extra => new CheckGroupV1('group-v1', { name: 'Group', ...extra })],
  ['CheckGroupV2', extra => new CheckGroupV2('group-v2', { name: 'Group', ...extra })],
]

/** The abstract bases, and the one check type that never runs in a location. */
const notScheduled = new Set(['RuntimeCheck', 'RepairableRuntimeCheck', 'Monitor', 'HeartbeatMonitor'])

async function invalidLocations (construct: Construct): Promise<InvalidPropertyValueDiagnostic[]> {
  const diagnostics = new Diagnostics()
  await construct.validate(diagnostics)
  return diagnostics.observations.filter((observation): observation is InvalidPropertyValueDiagnostic =>
    observation instanceof InvalidPropertyValueDiagnostic && observation.property === 'locations')
}

function expectRetired (diagnostics: InvalidPropertyValueDiagnostic[]): void {
  expect(diagnostics).toHaveLength(1)
  const [diagnostic] = diagnostics
  expect(diagnostic).toBeInstanceOf(InvalidPropertyValueDiagnostic)
  expect(diagnostic.isFatal()).toBe(true)
  expect(diagnostic.property).toBe('locations')
  expect(diagnostic.error?.message).toBe(MESSAGE)
  expect(diagnostic.message).toBe(
    'The value provided for property "locations" is not valid.\n\nReason: ' + MESSAGE,
  )
}

describe('retired locations', () => {
  beforeEach(async () => {
    Session.project = new Project('retired-locations', { name: 'Retired locations' })
    Session.availableRuntimes = Object.fromEntries((await loadSnapshot()).map(runtime => [runtime.name, runtime]))
    Session.defaultRuntimeId = '2025.04'
    Session.warnOnMissingCheckLocations = true
  })

  afterEach(() => {
    Session.reset()
  })

  it('covers every scheduled check type', () => {
    const checkTypes = Object.entries(constructs)
      .filter(([, value]) => typeof value === 'function' && value.prototype instanceof Check)
      .map(([name]) => name)
      .filter(name => !notScheduled.has(name))
    expect(scheduled.map(([name]) => name).sort()).toEqual(checkTypes.sort())
  })

  describe.each(scheduled)('%s', (_name, create) => {
    it('reports a retired location next to a valid one', async () => {
      expectRetired(await invalidLocations(create({ locations: RETIRED_AND_VALID })))
    })

    it('reports a retired location only once', async () => {
      expectRetired(await invalidLocations(create({ locations: [...RETIRED, ...RETIRED] })))
    })

    it('reports a retired location from the checks.locations default', async () => {
      Session.checkDefaults = retiredDefaults()
      expectRetired(await invalidLocations(create({})))
    })

    it('reports a retired location on a test-only check', async () => {
      expectRetired(await invalidLocations(create({ locations: RETIRED, testOnly: true })))
    })

    it('reports nothing for valid locations', async () => {
      const diagnostics = new Diagnostics()
      await create({ locations: ['eu-central-1', 'us-east-1'] }).validate(diagnostics)
      expect(diagnostics.observations.filter(observation =>
        observation instanceof InvalidPropertyValueDiagnostic && observation.property === 'locations')).toEqual([])
      expect(diagnostics.observations.filter(observation => observation.message.includes(MESSAGE))).toEqual([])
    })

    it('does not crash on a locations value that is not a list', async () => {
      const diagnostics = new Diagnostics()
      await create({ locations: 'me-south-1' }).validate(diagnostics)
      expect(diagnostics.observations.filter(observation => observation.message.includes(MESSAGE))).toEqual([])
    })
  })

  describe.each(groups)('%s', (_name, create) => {
    it('reports a retired location next to a valid one', async () => {
      expectRetired(await invalidLocations(create({ locations: RETIRED_AND_VALID })))
    })

    it('reports a retired location as its only location', async () => {
      expectRetired(await invalidLocations(create({ locations: RETIRED })))
    })

    it('reports nothing for valid locations', async () => {
      expect(await invalidLocations(create({ locations: ['eu-central-1'] }))).toEqual([])
    })

    it('reports nothing without locations', async () => {
      expect(await invalidLocations(create({}))).toEqual([])
    })
  })

  it('leaves a HeartbeatMonitor alone, even with a checks.locations default', async () => {
    Session.checkDefaults = retiredDefaults()
    const check = new HeartbeatMonitor('heartbeat', {
      name: 'Heartbeat', period: 1, periodUnit: 'hours', grace: 1, graceUnit: 'hours',
    })
    const diagnostics = new Diagnostics()
    await check.validate(diagnostics)
    expect(diagnostics.observations).toEqual([])
  })
})
