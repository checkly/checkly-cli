import { describe, it, expect } from 'vitest'

import { GrpcMonitor, GrpcAssertionBuilder, CheckGroup, GrpcRequest, Diagnostics } from '../index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import { Bundler } from '../../services/check-parser/bundler.js'

const request: GrpcRequest = {
  url: 'grpc.example.com',
  port: 50051,
  grpcConfig: {
    mode: 'BEHAVIOR',
    method: '/grpc.health.v1.Health/Check',
  },
}

function setupProject () {
  Session.project = new Project('project-id', {
    name: 'Test Project',
    repoUrl: 'https://github.com/checkly/checkly-cli',
  })
}

describe('GrpcMonitor', () => {
  it('should apply default check settings', () => {
    setupProject()
    Session.checkDefaults = { tags: ['default tags'] }
    const check = new GrpcMonitor('test-check', {
      name: 'Test Check',
      request,
    })
    Session.checkDefaults = undefined
    expect(check).toMatchObject({ tags: ['default tags'] })
  })

  it('should overwrite default check settings with check-specific config', () => {
    setupProject()
    Session.checkDefaults = { tags: ['default tags'] }
    const check = new GrpcMonitor('test-check', {
      name: 'Test Check',
      tags: ['test check'],
      request,
    })
    Session.checkDefaults = undefined
    expect(check).toMatchObject({ tags: ['test check'] })
  })

  it('should synthesize the GRPC check type and request', () => {
    setupProject()
    const check = new GrpcMonitor('test-check', {
      name: 'Test Check',
      activated: false,
      muted: true,
      degradedResponseTime: 3000,
      maxResponseTime: 10000,
      request: {
        url: 'grpc.example.com',
        port: 50051,
        ipFamily: 'IPv4',
        skipSSL: false,
        timeout: 60,
        grpcConfig: {
          mode: 'BEHAVIOR',
          tls: true,
          storeResponseBody: true,
          serviceDefinition: 'REFLECTION',
          method: '/grpc.health.v1.Health/Check',
        },
        assertions: [
          GrpcAssertionBuilder.statusCode().equals(0),
          GrpcAssertionBuilder.responseTime().lessThan(5000),
        ],
      },
    })

    const payload = check.synthesize()
    expect(payload).toMatchObject({
      checkType: 'GRPC',
      activated: false,
      muted: true,
      degradedResponseTime: 3000,
      maxResponseTime: 10000,
      request: {
        url: 'grpc.example.com',
        port: 50051,
        grpcConfig: {
          mode: 'BEHAVIOR',
          method: '/grpc.health.v1.Health/Check',
        },
        assertions: [
          expect.objectContaining({ source: 'GRPC_STATUS_CODE', comparison: 'EQUALS', target: '0' }),
          expect.objectContaining({ source: 'RESPONSE_TIME', comparison: 'LESS_THAN', target: '5000' }),
        ],
      },
    })
  })

  it('should support setting groups with `group`', async () => {
    setupProject()
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new GrpcMonitor('main-check', {
      name: 'Main Check',
      request,
      group,
    })
    const bundler = await Bundler.create({ cacheHash: 'foo' })
    const bundle = await check.bundle(bundler)
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  describe('validation', () => {
    it('should error if degradedResponseTime is above 180000', async () => {
      setupProject()
      const check = new GrpcMonitor('test-check', {
        name: 'Test Check',
        request,
        degradedResponseTime: 180001,
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('The value of "degradedResponseTime" must be 180000 or lower.'),
        }),
      ]))
    })

    it('should not error for a response time above 30000 (gRPC allows up to 180000)', async () => {
      setupProject()
      const check = new GrpcMonitor('test-check', {
        name: 'Test Check',
        request,
        degradedResponseTime: 90000,
        maxResponseTime: 120000,
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(false)
    })

    it('should error when degradedResponseTime exceeds the default maxResponseTime', async () => {
      setupProject()
      const check = new GrpcMonitor('test-check', {
        name: 'Test Check',
        request,
        degradedResponseTime: 30000,
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('must be less than or equal to the default "maxResponseTime" of 20000'),
        }),
      ]))
    })

    it('should not error within limits', async () => {
      setupProject()
      const check = new GrpcMonitor('test-check', {
        name: 'Test Check',
        request,
        degradedResponseTime: 5000,
        maxResponseTime: 10000,
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(false)
    })

    it('should error on an assertion with an unknown source', async () => {
      setupProject()
      const check = new GrpcMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          // HOP_COUNT belongs to traceroute, not gRPC.
          assertions: [{ source: 'HOP_COUNT', property: '', comparison: 'LESS_THAN', target: '5', regex: null }],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The assertion at "request.assertions[0]" has an unknown source "HOP_COUNT".',
          ),
        }),
      ]))
    })

    it('should error on an assertion with an unsupported comparison', async () => {
      setupProject()
      const check = new GrpcMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          // GREATER_THAN_OR_EQUAL is an SSL-only operator, not in the gRPC set.
          assertions: [
            { source: 'GRPC_STATUS_CODE', property: '', comparison: 'GREATER_THAN_OR_EQUAL', target: '0', regex: null },
          ],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('has an unsupported comparison "GREATER_THAN_OR_EQUAL"'),
        }),
      ]))
    })

    it('should accept every comparison in the backend gRPC set', async () => {
      setupProject()
      // Pins the full accepted set so silently dropping one from the validator's list
      // is caught, since it is not compile-checked against a union.
      const comparisons = [
        'EQUALS', 'NOT_EQUALS', 'HAS_KEY', 'NOT_HAS_KEY', 'HAS_VALUE', 'NOT_HAS_VALUE',
        'IS_EMPTY', 'NOT_EMPTY', 'GREATER_THAN', 'LESS_THAN', 'CONTAINS', 'NOT_CONTAINS',
        'IS_NULL', 'NOT_NULL',
      ]
      const check = new GrpcMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          assertions: comparisons.map(comparison => (
            { source: 'GRPC_RESPONSE', property: '', comparison, target: 'x', regex: null }
          )),
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(false)
    })

    it('should not error on a property carried by any gRPC source', async () => {
      setupProject()
      const check = new GrpcMonitor('test-check', {
        name: 'Test Check',
        request: {
          ...request,
          // gRPC places no source/property constraint, so a property on RESPONSE_TIME
          // (which the traceroute validator would reject) is accepted here.
          assertions: [
            { source: 'RESPONSE_TIME', property: 'avg', comparison: 'LESS_THAN', target: '5000', regex: null },
            GrpcAssertionBuilder.responseMetadata('content-type').contains('grpc'),
          ],
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(false)
    })
  })
})
