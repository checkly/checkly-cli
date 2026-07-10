import { describe, it, expect } from 'vitest'

import { TracerouteMonitor, TracerouteAssertionBuilder, CheckGroup, TracerouteRequest, Diagnostics } from '../index.js'
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
  })
})
