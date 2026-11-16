import { beforeEach, describe, expect, it } from 'vitest'

import {
  ApiCheck,
  DnsMonitor,
  GrpcMonitor,
  IcmpMonitor,
  SslMonitor,
  TcpMonitor,
  UrlMonitor,
} from '../index.js'
import { Diagnostics } from '../diagnostics.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

beforeEach(() => {
  Session.project = new Project('project-id', {
    name: 'Test Project',
    repoUrl: 'https://github.com/checkly/checkly-cli',
  })
})

type Limits = { degradedResponseTime?: number, maxResponseTime?: number }

// The values are the defaults the API applies to a limit the payload leaves
// out, per check type. A construct that sends another value here would change
// the limits of every check that does not set them.
const responseTimeCases = [
  {
    type: 'ApiCheck',
    create: (limits: Limits) => new ApiCheck('check', {
      name: 'Check',
      request: { url: 'https://example.com', method: 'GET' },
      ...limits,
    }),
    defaults: { degradedResponseTime: 5000, maxResponseTime: 20000 },
  },
  {
    type: 'UrlMonitor',
    create: (limits: Limits) => new UrlMonitor('check', {
      name: 'Check',
      request: { url: 'https://example.com' },
      ...limits,
    }),
    defaults: { degradedResponseTime: 3000, maxResponseTime: 5000 },
  },
  {
    type: 'TcpMonitor',
    create: (limits: Limits) => new TcpMonitor('check', {
      name: 'Check',
      request: { hostname: 'example.com', port: 443 },
      ...limits,
    }),
    defaults: { degradedResponseTime: 3000, maxResponseTime: 5000 },
  },
  {
    type: 'DnsMonitor',
    create: (limits: Limits) => new DnsMonitor('check', {
      name: 'Check',
      request: { recordType: 'A', query: 'example.com' },
      ...limits,
    }),
    defaults: { degradedResponseTime: 500, maxResponseTime: 1000 },
  },
  {
    type: 'GrpcMonitor',
    create: (limits: Limits) => new GrpcMonitor('check', {
      name: 'Check',
      request: { url: 'grpc.example.com:443' },
      ...limits,
    }),
    defaults: { degradedResponseTime: 10000, maxResponseTime: 20000 },
  },
  {
    type: 'SslMonitor',
    create: (limits: Limits) => new SslMonitor('check', {
      name: 'Check',
      request: { hostname: 'example.com', sslConfig: {} },
      ...limits,
    }),
    defaults: { degradedResponseTime: 3000, maxResponseTime: 10000 },
  },
]

describe('default limits', () => {
  describe.each(responseTimeCases)('$type', ({ create, defaults }) => {
    it('should synthesize the default response time limits when they are not set', () => {
      expect(create({}).synthesize()).toMatchObject(defaults)
    })

    it('should synthesize a limit that is set and the default of the one that is not', () => {
      expect(create({ degradedResponseTime: 1 }).synthesize()).toMatchObject({
        degradedResponseTime: 1,
        maxResponseTime: defaults.maxResponseTime,
      })
      expect(create({ maxResponseTime: 2 }).synthesize()).toMatchObject({
        degradedResponseTime: defaults.degradedResponseTime,
        maxResponseTime: 2,
      })
    })

    it('should synthesize a limit of 0 as 0', () => {
      expect(create({ degradedResponseTime: 0, maxResponseTime: 0 }).synthesize()).toMatchObject({
        degradedResponseTime: 0,
        maxResponseTime: 0,
      })
    })
  })

  describe('IcmpMonitor', () => {
    type Thresholds = { degradedPacketLossThreshold?: number, maxPacketLossThreshold?: number }
    const create = (thresholds: Thresholds) => new IcmpMonitor('check', {
      name: 'Check',
      request: { hostname: 'example.com' },
      ...thresholds,
    })

    it('should synthesize the default packet loss thresholds when they are not set', () => {
      expect(create({}).synthesize()).toMatchObject({
        degradedPacketLossThreshold: 10,
        maxPacketLossThreshold: 20,
      })
    })

    it('should synthesize a threshold that is set and the default of the one that is not', () => {
      expect(create({ degradedPacketLossThreshold: 5 }).synthesize()).toMatchObject({
        degradedPacketLossThreshold: 5,
        maxPacketLossThreshold: 20,
      })
    })

    const validate = async (thresholds: Thresholds) => {
      const diagnostics = new Diagnostics()
      await create(thresholds).validate(diagnostics)
      return diagnostics
    }

    it('should error when degradedPacketLossThreshold alone exceeds the default maxPacketLossThreshold', async () => {
      const diagnostics = await validate({ degradedPacketLossThreshold: 21 })
      expect(diagnostics.isFatal()).toEqual(true)
      expect(diagnostics.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('the default "maxPacketLossThreshold" of 20'),
        }),
      ]))
    })

    it('should error when maxPacketLossThreshold alone is below the default degradedPacketLossThreshold', async () => {
      const diagnostics = await validate({ maxPacketLossThreshold: 9 })
      expect(diagnostics.isFatal()).toEqual(true)
      expect(diagnostics.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('the default "degradedPacketLossThreshold" of 10'),
        }),
      ]))
    })

    it('should error when degradedPacketLossThreshold exceeds maxPacketLossThreshold', async () => {
      const diagnostics = await validate({ degradedPacketLossThreshold: 50, maxPacketLossThreshold: 40 })
      expect(diagnostics.isFatal()).toEqual(true)
    })

    it('should accept thresholds at the defaults of the other and equal thresholds', async () => {
      expect((await validate({ degradedPacketLossThreshold: 20 })).isFatal()).toEqual(false)
      expect((await validate({ maxPacketLossThreshold: 10 })).isFatal()).toEqual(false)
      expect((await validate({ degradedPacketLossThreshold: 30, maxPacketLossThreshold: 30 })).isFatal()).toEqual(false)
      expect((await validate({})).isFatal()).toEqual(false)
    })
  })
})
