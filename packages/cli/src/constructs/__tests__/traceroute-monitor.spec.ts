import { describe, it, expect } from 'vitest'

import { TracerouteMonitor, CheckGroup, TracerouteRequest, TracerouteAssertionBuilder, Diagnostics } from '../index'
import { Project, Session } from '../project'
import { Bundler } from '../../services/check-parser/bundler'

const request: TracerouteRequest = {
  hostname: 'acme.com',
}

describe('TracerouteMonitor', () => {
  it('should apply default check settings', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const check = new TracerouteMonitor('test-check', {
      name: 'Test Check',
      request,
    })
    Session.checkDefaults = undefined
    expect(check).toMatchObject({ tags: ['default tags'] })
  })

  it('should overwrite default check settings with check-specific config', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const check = new TracerouteMonitor('test-check', {
      name: 'Test Check',
      tags: ['test check'],
      request,
    })
    Session.checkDefaults = undefined
    expect(check).toMatchObject({ tags: ['test check'] })
  })

  it('should support setting groups with `groupId`', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new TracerouteMonitor('main-check', {
      name: 'Main Check',
      request,
      groupId: group.ref(),
    })
    const bundler = await Bundler.create({
      cacheHash: 'foo',
    })
    const bundle = await check.bundle(bundler)
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  it('should support setting groups with `group`', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new TracerouteMonitor('main-check', {
      name: 'Main Check',
      request,
      group,
    })
    const bundler = await Bundler.create({
      cacheHash: 'foo',
    })
    const bundle = await check.bundle(bundler)
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  it('should synthesize with correct checkType', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const check = new TracerouteMonitor('test-check', {
      name: 'Test Check',
      request,
      degradedResponseTime: 15000,
      maxResponseTime: 30000,
    })
    const synthesized = check.synthesize()
    expect(synthesized).toMatchObject({
      checkType: 'TRACEROUTE',
      request: { hostname: 'acme.com' },
      degradedResponseTime: 15000,
      maxResponseTime: 30000,
    })
  })

  it('should support all request parameters', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const check = new TracerouteMonitor('test-check', {
      name: 'Test Check',
      request: {
        hostname: 'example.com',
        port: 8443,
        ipFamily: 'IPv6',
        maxHops: 20,
        maxUnknownHops: 10,
        ptrLookup: false,
        timeout: 15,
      },
    })
    const synthesized = check.synthesize()
    expect(synthesized.request).toMatchObject({
      hostname: 'example.com',
      port: 8443,
      ipFamily: 'IPv6',
      maxHops: 20,
      maxUnknownHops: 10,
      ptrLookup: false,
      timeout: 15,
    })
  })

  describe('validation', () => {
    it('should error if doubleCheck is set', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request,
        // @ts-expect-error Not available in the type.
        doubleCheck: true,
      })

      const diags = new Diagnostics()
      await check.validate(diags)

      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Property "doubleCheck" is not supported.'),
        }),
      ]))
    })
  })

  describe('assertions', () => {
    it('should support response time assertions with property', () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          hostname: 'example.com',
          assertions: [
            TracerouteAssertionBuilder.responseTime('avg').lessThan(100),
            TracerouteAssertionBuilder.responseTime('max').lessThan(200),
            TracerouteAssertionBuilder.responseTime('min').greaterThan(10),
            TracerouteAssertionBuilder.responseTime('stdDev').lessThan(50),
          ],
        },
      })

      const synthesized = check.synthesize()
      expect(synthesized.request.assertions).toEqual([
        { source: 'RESPONSE_TIME', property: 'avg', comparison: 'LESS_THAN', target: '100', regex: null },
        { source: 'RESPONSE_TIME', property: 'max', comparison: 'LESS_THAN', target: '200', regex: null },
        { source: 'RESPONSE_TIME', property: 'min', comparison: 'GREATER_THAN', target: '10', regex: null },
        { source: 'RESPONSE_TIME', property: 'stdDev', comparison: 'LESS_THAN', target: '50', regex: null },
      ])
    })

    it('should support hop count assertions', () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          hostname: 'example.com',
          assertions: [
            TracerouteAssertionBuilder.hopCount().lessThan(15),
          ],
        },
      })

      const synthesized = check.synthesize()
      expect(synthesized.request.assertions).toEqual([
        { source: 'HOP_COUNT', property: '', comparison: 'LESS_THAN', target: '15', regex: null },
      ])
    })

    it('should support packet loss assertions', () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new TracerouteMonitor('test-check', {
        name: 'Test Check',
        request: {
          hostname: 'example.com',
          assertions: [
            TracerouteAssertionBuilder.packetLoss().lessThan(10),
          ],
        },
      })

      const synthesized = check.synthesize()
      expect(synthesized.request.assertions).toEqual([
        { source: 'PACKET_LOSS', property: '', comparison: 'LESS_THAN', target: '10', regex: null },
      ])
    })
  })
})

describe('TracerouteAssertionBuilder', () => {
  describe('responseTime', () => {
    it('should create equals assertion', () => {
      const assertion = TracerouteAssertionBuilder.responseTime('avg').equals(50)
      expect(assertion).toEqual({
        source: 'RESPONSE_TIME',
        property: 'avg',
        comparison: 'EQUALS',
        target: '50',
        regex: null,
      })
    })

    it('should create lessThan assertion', () => {
      const assertion = TracerouteAssertionBuilder.responseTime('max').lessThan(100)
      expect(assertion).toEqual({
        source: 'RESPONSE_TIME',
        property: 'max',
        comparison: 'LESS_THAN',
        target: '100',
        regex: null,
      })
    })

    it('should create greaterThan assertion', () => {
      const assertion = TracerouteAssertionBuilder.responseTime('min').greaterThan(10)
      expect(assertion).toEqual({
        source: 'RESPONSE_TIME',
        property: 'min',
        comparison: 'GREATER_THAN',
        target: '10',
        regex: null,
      })
    })
  })

  describe('hopCount', () => {
    it('should create lessThan assertion', () => {
      const assertion = TracerouteAssertionBuilder.hopCount().lessThan(15)
      expect(assertion).toEqual({
        source: 'HOP_COUNT',
        property: '',
        comparison: 'LESS_THAN',
        target: '15',
        regex: null,
      })
    })
  })

  describe('packetLoss', () => {
    it('should create lessThan assertion', () => {
      const assertion = TracerouteAssertionBuilder.packetLoss().lessThan(10)
      expect(assertion).toEqual({
        source: 'PACKET_LOSS',
        property: '',
        comparison: 'LESS_THAN',
        target: '10',
        regex: null,
      })
    })
  })
})
