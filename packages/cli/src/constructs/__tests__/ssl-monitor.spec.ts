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
            SslAssertionBuilder.keySizeBits().equals(2048),
            SslAssertionBuilder.tlsVersion().equals('TLS1.3'),
            SslAssertionBuilder.cipherSuite().equals('TLS_AES_256_GCM_SHA384'),
            SslAssertionBuilder.issuerCn().equals('Let\'s Encrypt'),
            SslAssertionBuilder.ocspStapled().equals(true),
          ],
        },
      })

      const payload = check.synthesize() as any
      expect(payload.request.assertions).toEqual([
        expect.objectContaining({ source: 'KEY_SIZE_BITS', comparison: 'EQUALS', target: '2048' }),
        expect.objectContaining({ source: 'TLS_VERSION', comparison: 'EQUALS', target: 'TLS1.3' }),
        expect.objectContaining({ source: 'CIPHER_SUITE', comparison: 'EQUALS', target: 'TLS_AES_256_GCM_SHA384' }),
        expect.objectContaining({ source: 'ISSUER_CN', comparison: 'EQUALS', target: 'Let\'s Encrypt' }),
        expect.objectContaining({ source: 'OCSP_STAPLED', comparison: 'EQUALS', target: 'true' }),
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

  describe('assertion validation', () => {
    async function validateWith (assertions: SslRequest['assertions']): Promise<Diagnostics> {
      setupProject()
      const check = new SslMonitor('test-check', {
        name: 'Test Check',
        request: { hostname: 'example.com', sslConfig: {}, assertions },
      })
      const diags = new Diagnostics()
      await check.validate(diags)
      return diags
    }

    it('should error on an assertion with an unknown source', async () => {
      const diags = await validateWith([
        { source: 'HANDSHAKE_TIME_MS', property: '', comparison: 'LESS_THAN', target: '100', regex: null },
      ] as unknown as SslRequest['assertions'])
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The assertion at "request.assertions[0]" has an unknown source "HANDSHAKE_TIME_MS".',
          ),
        }),
      ]))
    })

    it('should error on a comparison the source does not allow', async () => {
      const diags = await validateWith([
        // KEY_SIZE_BITS supports EQUALS only.
        { source: 'KEY_SIZE_BITS', property: '', comparison: 'GREATER_THAN', target: '2048', regex: null },
      ])
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The KEY_SIZE_BITS assertion at "request.assertions[0]" has an unsupported comparison "GREATER_THAN".',
          ),
        }),
      ]))
    })

    it('should error on MATCHES for a source that does not allow it', async () => {
      const diags = await validateWith([
        { source: 'CERT_EXPIRES_IN_DAYS', property: '', comparison: 'MATCHES', target: '.*', regex: null },
      ])
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('has an unsupported comparison "MATCHES"') }),
      ]))
    })

    it('should error on a boolean source with a non-boolean target', async () => {
      const diags = await validateWith([
        { source: 'CERT_NOT_EXPIRED', property: '', comparison: 'EQUALS', target: 'yes', regex: null },
      ])
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The CERT_NOT_EXPIRED assertion at "request.assertions[0]" must compare against "true" or "false", but got "yes".',
          ),
        }),
      ]))
    })

    it('should not error on assertions built with SslAssertionBuilder', async () => {
      const diags = await validateWith([
        SslAssertionBuilder.certExpiresInDays().greaterThan(30),
        SslAssertionBuilder.keySizeBits().equals(2048),
        SslAssertionBuilder.chainTrusted().equals(true),
        SslAssertionBuilder.tlsVersion().equals('TLS1.3'),
        SslAssertionBuilder.cipherSuite().matches('TLS_(AES|CHACHA)'),
        SslAssertionBuilder.issuerCn().matches('^Let\'s Encrypt'),
      ])
      expect(diags.isFatal()).toEqual(false)
    })
  })
})
