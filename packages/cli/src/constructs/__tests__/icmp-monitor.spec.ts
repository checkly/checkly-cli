import { describe, it, expect } from 'vitest'

import { IcmpMonitor, CheckGroup, IcmpRequest, IcmpAssertionBuilder, Diagnostics } from '../index'
import { Project, Session } from '../project'

const request: IcmpRequest = {
  hostname: 'acme.com',
}

describe('IcmpMonitor', () => {
  it('should apply default check settings', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    Session.checkDefaults = { tags: ['default tags'] }
    const check = new IcmpMonitor('test-check', {
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
    const check = new IcmpMonitor('test-check', {
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
    const check = new IcmpMonitor('main-check', {
      name: 'Main Check',
      request,
      groupId: group.ref(),
    })
    const bundle = await check.bundle()
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  it('should support setting groups with `group`', async () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new IcmpMonitor('main-check', {
      name: 'Main Check',
      request,
      group,
    })
    const bundle = await check.bundle()
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  it('should synthesize with correct checkType', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const check = new IcmpMonitor('test-check', {
      name: 'Test Check',
      request,
      degradedPacketLossThreshold: 10,
      maxPacketLossThreshold: 20,
    })
    const synthesized = check.synthesize()
    expect(synthesized).toMatchObject({
      checkType: 'ICMP',
      request: { hostname: 'acme.com' },
      degradedPacketLossThreshold: 10,
      maxPacketLossThreshold: 20,
    })
  })

  it('should support ipFamily and pingCount in request', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const check = new IcmpMonitor('test-check', {
      name: 'Test Check',
      request: {
        hostname: 'example.com',
        ipFamily: 'IPv6',
        pingCount: 5,
      },
    })
    const synthesized = check.synthesize()
    expect(synthesized.request).toMatchObject({
      hostname: 'example.com',
      ipFamily: 'IPv6',
      pingCount: 5,
    })
  })

  describe('validation', () => {
    it('should error if doubleCheck is set', async () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new IcmpMonitor('test-check', {
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
    it('should support latency assertions with property', () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new IcmpMonitor('test-check', {
        name: 'Test Check',
        request: {
          hostname: 'example.com',
          assertions: [
            IcmpAssertionBuilder.latency('avg').lessThan(100),
            IcmpAssertionBuilder.latency('max').lessThan(200),
            IcmpAssertionBuilder.latency('min').greaterThan(10),
            IcmpAssertionBuilder.latency('stdDev').lessThan(50),
          ],
        },
      })

      const synthesized = check.synthesize()
      expect(synthesized.request.assertions).toEqual([
        { source: 'LATENCY', property: 'avg', comparison: 'LESS_THAN', target: '100', regex: null },
        { source: 'LATENCY', property: 'max', comparison: 'LESS_THAN', target: '200', regex: null },
        { source: 'LATENCY', property: 'min', comparison: 'GREATER_THAN', target: '10', regex: null },
        { source: 'LATENCY', property: 'stdDev', comparison: 'LESS_THAN', target: '50', regex: null },
      ])
    })

    it('should support JSON response assertions', () => {
      Session.project = new Project('project-id', {
        name: 'Test Project',
        repoUrl: 'https://github.com/checkly/checkly-cli',
      })

      const check = new IcmpMonitor('test-check', {
        name: 'Test Check',
        request: {
          hostname: 'example.com',
          assertions: [
            IcmpAssertionBuilder.jsonResponse('$.packetLoss').lessThan(10),
            IcmpAssertionBuilder.jsonResponse('$.packetsReceived').greaterThan(8),
          ],
        },
      })

      const synthesized = check.synthesize()
      expect(synthesized.request.assertions).toEqual([
        { source: 'JSON_RESPONSE', property: '$.packetLoss', comparison: 'LESS_THAN', target: '10', regex: null },
        { source: 'JSON_RESPONSE', property: '$.packetsReceived', comparison: 'GREATER_THAN', target: '8', regex: null },
      ])
    })
  })
})

describe('IcmpAssertionBuilder', () => {
  describe('latency', () => {
    it('should create equals assertion', () => {
      const assertion = IcmpAssertionBuilder.latency('avg').equals(50)
      expect(assertion).toEqual({
        source: 'LATENCY',
        property: 'avg',
        comparison: 'EQUALS',
        target: '50',
        regex: null,
      })
    })

    it('should create notEquals assertion', () => {
      const assertion = IcmpAssertionBuilder.latency('avg').notEquals(50)
      expect(assertion).toEqual({
        source: 'LATENCY',
        property: 'avg',
        comparison: 'NOT_EQUALS',
        target: '50',
        regex: null,
      })
    })

    it('should create lessThan assertion', () => {
      const assertion = IcmpAssertionBuilder.latency('max').lessThan(100)
      expect(assertion).toEqual({
        source: 'LATENCY',
        property: 'max',
        comparison: 'LESS_THAN',
        target: '100',
        regex: null,
      })
    })

    it('should create greaterThan assertion', () => {
      const assertion = IcmpAssertionBuilder.latency('min').greaterThan(10)
      expect(assertion).toEqual({
        source: 'LATENCY',
        property: 'min',
        comparison: 'GREATER_THAN',
        target: '10',
        regex: null,
      })
    })
  })

  describe('jsonResponse', () => {
    it('should create assertion with property', () => {
      const assertion = IcmpAssertionBuilder.jsonResponse('$.packetLoss').lessThan(10)
      expect(assertion).toEqual({
        source: 'JSON_RESPONSE',
        property: '$.packetLoss',
        comparison: 'LESS_THAN',
        target: '10',
        regex: null,
      })
    })

    it('should create assertion without property', () => {
      const assertion = IcmpAssertionBuilder.jsonResponse().notEmpty()
      expect(assertion).toEqual({
        source: 'JSON_RESPONSE',
        property: '',
        comparison: 'NOT_EMPTY',
        target: '',
        regex: null,
      })
    })

    it('should support contains assertion', () => {
      const assertion = IcmpAssertionBuilder.jsonResponse('$.hostname').contains('example')
      expect(assertion).toEqual({
        source: 'JSON_RESPONSE',
        property: '$.hostname',
        comparison: 'CONTAINS',
        target: 'example',
        regex: null,
      })
    })
  })
})
