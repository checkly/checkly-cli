import { describe, it, expect } from 'vitest'

import { SslMonitor, SslAssertionBuilder, CheckGroup, SslRequest, Diagnostics } from '../index.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import { Bundler } from '../../services/check-parser/bundler.js'

const request: SslRequest = {
  hostname: 'example.com',
  port: 443,
  sslConfig: {},
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

  it('should synthesize the SSL check type with top-level response times', () => {
    setupProject()
    const check = new SslMonitor('test-check', {
      name: 'Test Check',
      degradedResponseTime: 3000,
      maxResponseTime: 10000,
      request: {
        hostname: 'example.com',
        port: 443,
        ipFamily: 'IPv4',
        sslConfig: {
          skipChainValidation: false,
          handshakeTimeout: 10000,
          alertDaysBeforeExpiry: 20,
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
      degradedResponseTime: 3000,
      maxResponseTime: 10000,
      request: {
        sslConfig: {
          hostname: 'example.com',
          port: 443,
        },
        assertions: [
          expect.objectContaining({ source: 'CERT_EXPIRES_IN_DAYS', comparison: 'GREATER_THAN', target: '20' }),
          expect.objectContaining({ source: 'CHAIN_TRUSTED', comparison: 'EQUALS', target: 'true' }),
        ],
      },
    })
    // Response times are top-level, no longer nested inside request.sslConfig.
    expect(payload.request.sslConfig.degradedResponseTimeMs).toBeUndefined()
    expect(payload.request.sslConfig.maxResponseTimeMs).toBeUndefined()
  })

  it('should synthesize the correct wire shape with hostname and ipFamily inside sslConfig', () => {
    setupProject()
    const check = new SslMonitor('test-check', {
      name: 'Test Check',
      degradedResponseTime: 3000,
      maxResponseTime: 10000,
      request: {
        hostname: 'example.com',
        port: 443,
        ipFamily: 'IPv6',
        sslConfig: {
          serverName: 'example.com',
          sslClientCertificateId: 'clientcert_1234',
          alertDaysBeforeExpiry: 30,
          skipChainValidation: false,
        },
        assertions: [
          SslAssertionBuilder.certExpiresInDays().greaterThan(30),
        ],
      },
    })

    const payload = check.synthesize() as any
    expect(payload.request.sslConfig.hostname).toBe('example.com')
    expect(payload.request.sslConfig.ipFamily).toBe('IPv6')
    expect(payload.degradedResponseTime).toBe(3000)
    expect(payload.maxResponseTime).toBe(10000)
    expect(payload.request.sslClientCertificateId).toBe('clientcert_1234')
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

  describe('assertions', () => {
    it('synthesizes the new SSL assertion sources with backend-compatible operators', () => {
      setupProject()
      const check = new SslMonitor('test-check', {
        name: 'Test Check',
        request: {
          hostname: 'example.com',
          sslConfig: {},
          assertions: [
            SslAssertionBuilder.keySizeBits().greaterThanOrEqual(2048),
            SslAssertionBuilder.tlsVersion().greaterThanOrEqual('TLS1.2'),
            SslAssertionBuilder.cipherSuite().matches('^TLS_AES_.*'),
            SslAssertionBuilder.issuerCn().matches('(?i)let\'s encrypt.*'),
            SslAssertionBuilder.handshakeTimeMs().lessThan(500),
            SslAssertionBuilder.ocspStapled().equals(true),
            SslAssertionBuilder.sanContains().equals('example.com'),
          ],
        },
      })

      const payload = check.synthesize() as any
      expect(payload.request.assertions).toEqual([
        expect.objectContaining({ source: 'KEY_SIZE_BITS', comparison: 'GREATER_THAN_OR_EQUAL', target: '2048' }),
        expect.objectContaining({ source: 'TLS_VERSION', comparison: 'GREATER_THAN_OR_EQUAL', target: 'TLS1.2' }),
        expect.objectContaining({ source: 'CIPHER_SUITE', comparison: 'MATCHES', target: '^TLS_AES_.*' }),
        expect.objectContaining({ source: 'ISSUER_CN', comparison: 'MATCHES' }),
        expect.objectContaining({ source: 'HANDSHAKE_TIME_MS', comparison: 'LESS_THAN', target: '500' }),
        expect.objectContaining({ source: 'OCSP_STAPLED', comparison: 'EQUALS', target: 'true' }),
        expect.objectContaining({ source: 'SAN_CONTAINS', comparison: 'EQUALS', target: 'example.com' }),
      ])
    })

    it('accepts a "degrade" baseline severity', () => {
      setupProject()
      const check = new SslMonitor('test-check', {
        name: 'Test Check',
        request: {
          hostname: 'example.com',
          sslConfig: {
            securityBaseline: {
              minTLSVersion: { value: 'TLS1.2', severity: 'degrade' },
            },
          },
        },
      })
      const payload = check.synthesize() as any
      expect(payload.request.sslConfig.securityBaseline.minTLSVersion.severity).toBe('degrade')
    })
  })

  describe('validation', () => {
    it('should error when clientCertificateMode is explicit but no certificate id is set', async () => {
      setupProject()
      const check = new SslMonitor('test-check', {
        name: 'Test Check',
        request: {
          hostname: 'example.com',
          sslConfig: {
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

    it('should not error when clientCertificateMode is explicit and certificate id is set', async () => {
      setupProject()
      const check = new SslMonitor('test-check', {
        name: 'Test Check',
        request: {
          hostname: 'example.com',
          sslConfig: {
            clientCertificateMode: 'explicit',
            sslClientCertificateId: 'clientcert_1234',
          },
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(false)
    })

    it('should error when degradedResponseTime exceeds maxResponseTime', async () => {
      setupProject()
      const check = new SslMonitor('test-check', {
        name: 'Test Check',
        degradedResponseTime: 8000,
        maxResponseTime: 5000,
        request: {
          hostname: 'example.com',
          sslConfig: {},
        },
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

    it('should error when degradedResponseTime exceeds the default maxResponseTime and max is omitted', async () => {
      setupProject()
      const check = new SslMonitor('test-check', {
        name: 'Test Check',
        // 20000 is within the 30000 degraded bound but above the 10000 default
        // maxResponseTime the backend applies when max is omitted.
        degradedResponseTime: 20000,
        request: {
          hostname: 'example.com',
          sslConfig: {},
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('must be less than or equal to the default "maxResponseTime" of 10000'),
        }),
      ]))
    })

    it('should not error when degradedResponseTime is within the default maxResponseTime and max is omitted', async () => {
      setupProject()
      const check = new SslMonitor('test-check', {
        name: 'Test Check',
        degradedResponseTime: 5000,
        request: {
          hostname: 'example.com',
          sslConfig: {},
        },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      expect(diags.isFatal()).toEqual(false)
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
