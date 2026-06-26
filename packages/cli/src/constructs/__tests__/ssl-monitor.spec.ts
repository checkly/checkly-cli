import { describe, it, expect } from 'vitest'

import { SslMonitor, SslAssertionBuilder, CheckGroup, SslRequest, Diagnostics } from '../index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import { Bundler } from '../../services/check-parser/bundler.js'

const request: SslRequest = {
  sslConfig: {
    hostname: 'example.com',
    port: 443,
  },
}

function setupProject () {
  Session.project = new Project('project-id', {
    name: 'Test Project',
    repoUrl: 'https://github.com/checkly/checkly-cli',
  })
}

describe('SslMonitor', () => {
  it('should apply default check settings', () => {
    setupProject()
    Session.checkDefaults = { tags: ['default tags'] }
    const check = new SslMonitor('test-check', {
      name: 'Test Check',
      request,
    })
    Session.checkDefaults = undefined
    expect(check).toMatchObject({ tags: ['default tags'] })
  })

  it('should synthesize the SSL check type with nested config response times', () => {
    setupProject()
    const check = new SslMonitor('test-check', {
      name: 'Test Check',
      request: {
        sslConfig: {
          hostname: 'example.com',
          port: 443,
          ipFamily: 'IPv4',
          skipChainValidation: false,
          handshakeTimeoutMs: 10000,
          alertDaysBeforeExpiry: 20,
          degradedResponseTimeMs: 3000,
          maxResponseTimeMs: 10000,
        },
        assertions: [
          SslAssertionBuilder.certExpiresInDays().greaterThan(20),
          SslAssertionBuilder.chainTrusted().equals(true),
        ],
      },
    })

    const payload = check.synthesize() as any
    expect(payload).toMatchObject({
      checkType: 'SSL',
      request: {
        sslConfig: {
          hostname: 'example.com',
          port: 443,
          degradedResponseTimeMs: 3000,
          maxResponseTimeMs: 10000,
        },
        assertions: [
          expect.objectContaining({ source: 'CERT_EXPIRES_IN_DAYS', comparison: 'GREATER_THAN', target: '20' }),
          expect.objectContaining({ source: 'CHAIN_TRUSTED', comparison: 'EQUALS', target: 'true' }),
        ],
      },
    })
    // SSL monitors carry no top-level response-time fields.
    expect(payload.degradedResponseTime).toBeUndefined()
    expect(payload.maxResponseTime).toBeUndefined()
  })

  it('should support setting groups with `group`', async () => {
    setupProject()
    const group = new CheckGroup('main-group', { name: 'Main Group', locations: [] })
    const check = new SslMonitor('main-check', {
      name: 'Main Check',
      request,
      group,
    })
    const bundler = await Bundler.create({ cacheHash: 'foo' })
    const bundle = await check.bundle(bundler)
    expect(bundle.synthesize()).toMatchObject({ groupId: { ref: 'main-group' } })
  })

  describe('validation', () => {
    it('should error when clientCertificateMode is explicit but no certificate id is set', async () => {
      setupProject()
      const check = new SslMonitor('test-check', {
        name: 'Test Check',
        request: {
          sslConfig: {
            hostname: 'example.com',
            clientCertificateMode: 'explicit',
          },
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('A value for "sslClientCertificateId" is required'),
        }),
      ]))
    })

    it('should error when degradedResponseTimeMs exceeds maxResponseTimeMs', async () => {
      setupProject()
      const check = new SslMonitor('test-check', {
        name: 'Test Check',
        request: {
          sslConfig: {
            hostname: 'example.com',
            degradedResponseTimeMs: 8000,
            maxResponseTimeMs: 5000,
          },
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('must be less than or equal to "maxResponseTimeMs"'),
        }),
      ]))
    })

    it('should not error for a valid config', async () => {
      setupProject()
      const check = new SslMonitor('test-check', { name: 'Test Check', request })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(false)
    })
  })
})
