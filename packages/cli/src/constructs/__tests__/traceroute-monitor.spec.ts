import { describe, it, expect } from 'vitest'

import {
  TracerouteMonitor,
  TracerouteAssertion,
  TracerouteAssertionBuilder,
  CheckGroup,
  TracerouteRequest,
  Diagnostics,
} from '../index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import { Bundler } from '../../services/check-parser/bundler.js'

const request: TracerouteRequest = {
  url: 'example.com',
}

function setupProject () {
  Session.project = new Project('project-id', {
    name: 'Test Project',
    repoUrl: 'https://github.com/checkly/checkly-cli',
  })
}

describe('TracerouteMonitor', () => {
  it('should apply default check settings', () => {
    setupProject()
    Session.checkDefaults = { tags: ['default tags'] }
    const check = new TracerouteMonitor('test-check', {
      name: 'Test Check',
      request,
    })
    Session.checkDefaults = undefined
    expect(check).toMatchObject({ tags: ['default tags'] })
  })

  it('should synthesize the TRACEROUTE check type and request', () => {
    setupProject()
    const check = new TracerouteMonitor('test-check', {
      name: 'Test Check',
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
        assertions: [
          TracerouteAssertionBuilder.packetLoss().lessThan(10),
          TracerouteAssertionBuilder.hopCount().lessThan(20),
        ],
      },
    })

    const payload = check.synthesize()
    expect(payload).toMatchObject({
      checkType: 'TRACEROUTE',
      degradedResponseTime: 10000,
      maxResponseTime: 20000,
      request: {
        url: 'example.com',
        protocol: 'TCP',
        port: 443,
        maxHops: 30,
        maxUnknownHops: 15,
        ptrLookup: true,
        timeout: 10,
        assertions: [
          expect.objectContaining({ source: 'PACKET_LOSS', comparison: 'LESS_THAN', target: '10' }),
          expect.objectContaining({ source: 'HOP_COUNT', comparison: 'LESS_THAN', target: '20' }),
        ],
      },
    })
  })

  it('should support setting groups with `group`', async () => {
    setupProject()
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new TracerouteMonitor('main-check', {
      name: 'Main Check',
      request,
      group,
    })
    const bundler = await Bundler.create({ cacheHash: 'foo' })
    const bundle = await check.bundle(bundler)
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  describe('responseTime() assertions', () => {
    it('should default the property to avg', () => {
      expect(TracerouteAssertionBuilder.responseTime().lessThan(1000)).toMatchObject({
        source: 'RESPONSE_TIME',
        property: 'avg',
        comparison: 'LESS_THAN',
        target: '1000',
      })
    })

    it('should support selecting a specific response-time property', () => {
      expect(TracerouteAssertionBuilder.responseTime('max').lessThan(2000)).toMatchObject({
        source: 'RESPONSE_TIME',
        property: 'max',
        comparison: 'LESS_THAN',
        target: '2000',
      })
      expect(TracerouteAssertionBuilder.responseTime('min').greaterThan(1)).toMatchObject({
        source: 'RESPONSE_TIME',
        property: 'min',
        comparison: 'GREATER_THAN',
      })
      expect(TracerouteAssertionBuilder.responseTime('stdDev').lessThan(50)).toMatchObject({
        source: 'RESPONSE_TIME',
        property: 'stdDev',
      })
      expect(TracerouteAssertionBuilder.responseTime('avg').equals(100)).toMatchObject({
        source: 'RESPONSE_TIME',
        property: 'avg',
        comparison: 'EQUALS',
      })
    })
  })

  describe('validation', () => {
    it('should error when degradedResponseTime exceeds maxResponseTime', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request,
        degradedResponseTime: 20000,
        maxResponseTime: 10000,
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('must be less than or equal to "maxResponseTime"'),
        }),
      ]))
    })

    it('should error if maxResponseTime is above 30000', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request,
        maxResponseTime: 30001,
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('The value of "maxResponseTime" must be 30000 or lower.'),
        }),
      ]))
    })

    it('should not error within limits', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request,
        degradedResponseTime: 10000,
        maxResponseTime: 20000,
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(false)
    })

    it('should error on a RESPONSE_TIME assertion without a property', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          assertions: [
            { source: 'RESPONSE_TIME', property: '', comparison: 'LESS_THAN', target: '1000', regex: null },
          ],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The RESPONSE_TIME assertion at "request.assertions[0]" has an invalid property (none).',
          ),
        }),
      ]))
    })

    it('should error on a RESPONSE_TIME assertion with an unknown property', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          assertions: [
            { source: 'RESPONSE_TIME', property: 'median', comparison: 'LESS_THAN', target: '1000', regex: null },
          ],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Expected one of "avg", "min", "max", "stdDev".'),
        }),
      ]))
    })

    it('should error on a HOP_COUNT assertion with a property', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          assertions: [
            { source: 'HOP_COUNT', property: 'avg', comparison: 'LESS_THAN', target: '20', regex: null },
          ],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The HOP_COUNT assertion at "request.assertions[0]" must not specify a property, but got "avg".',
          ),
        }),
      ]))
    })

    it('should error on a PACKET_LOSS assertion with a property', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          assertions: [
            { source: 'PACKET_LOSS', property: 'avg', comparison: 'LESS_THAN', target: '10', regex: null },
          ],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('The PACKET_LOSS assertion at "request.assertions[0]"'),
        }),
      ]))
    })

    it('should error on an assertion with an unknown source', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          assertions: [
            // Check files are loaded without type checking, so an unrecognized source
            // reaches validation at runtime despite not being part of the union.
            { source: 'JITTER', property: '', comparison: 'LESS_THAN', target: '5', regex: null },
          ] as unknown as TracerouteAssertion[],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The assertion at "request.assertions[0]" has an unknown source "JITTER".',
          ),
        }),
      ]))
    })

    it('should report the index of the offending assertion', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          assertions: [
            TracerouteAssertionBuilder.hopCount().lessThan(20),
            { source: 'RESPONSE_TIME', property: '', comparison: 'LESS_THAN', target: '1000', regex: null },
          ],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('request.assertions[1]'),
        }),
      ]))
    })

    it('should error on a HOP_COUNT assertion using NOT_EQUALS', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          // NOT_EQUALS is not offered on the hopCount() builder (see the compile-time
          // test below); a hand-written literal can still carry it, and the backend
          // accepts NOT_EQUALS only for RESPONSE_TIME.
          assertions: [{ source: 'HOP_COUNT', property: '', comparison: 'NOT_EQUALS', target: '20', regex: null }],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The HOP_COUNT assertion at "request.assertions[0]" has an unsupported comparison "NOT_EQUALS".',
          ),
        }),
      ]))
    })

    it('the builders do not offer NOT_EQUALS for hop count / packet loss', () => {
      // Compile-time-only checks: notEquals does not exist on these builders at
      // runtime, so the body is type-checked but never executed.

      const _typeChecks = () => {
        // @ts-expect-error notEquals is not available on the hop-count builder
        TracerouteAssertionBuilder.hopCount().notEquals(20)
        // @ts-expect-error notEquals is not available on the packet-loss builder
        TracerouteAssertionBuilder.packetLoss().notEquals(20)
      }
      expect(_typeChecks).toBeDefined()
    })

    it('should allow NOT_EQUALS for a RESPONSE_TIME assertion', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          assertions: [TracerouteAssertionBuilder.responseTime('avg').notEquals(1000)],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(false)
    })

    it('should error on an assertion with an unknown comparison', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          assertions: [
            { source: 'PACKET_LOSS', property: '', comparison: 'CONTAINS', target: '10', regex: null },
          ],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('has an unsupported comparison "CONTAINS"'),
        }),
      ]))
    })

    it('should not error on assertions built with TracerouteAssertionBuilder', async () => {
      setupProject()
      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          assertions: [
            TracerouteAssertionBuilder.responseTime().lessThan(1000),
            TracerouteAssertionBuilder.responseTime('stdDev').lessThan(50),
            TracerouteAssertionBuilder.hopCount().lessThan(20),
            TracerouteAssertionBuilder.packetLoss().lessThan(10),
          ],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(false)
    })
  })
})
