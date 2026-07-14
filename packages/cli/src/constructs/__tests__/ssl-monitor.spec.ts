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
          SslAssertionBuilder.certificate('daysUntilExpiry').greaterThan(20),
          SslAssertionBuilder.connection('chainTrusted').equals(true),
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
          expect.objectContaining({ source: 'CERTIFICATE', property: 'daysUntilExpiry', comparison: 'GREATER_THAN', target: '20' }),
          expect.objectContaining({ source: 'CONNECTION', property: 'chainTrusted', comparison: 'EQUALS', target: 'true' }),
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
          SslAssertionBuilder.certificate('daysUntilExpiry').greaterThan(30),
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
            SslAssertionBuilder.certificate('keySizeBits').equals(2048),
            SslAssertionBuilder.connection('tlsVersion').equals('TLS1.3'),
            SslAssertionBuilder.connection('cipherSuite').equals('TLS_AES_256_GCM_SHA384'),
            SslAssertionBuilder.certificate('issuerCN').equals('Let\'s Encrypt'),
            SslAssertionBuilder.connection('ocspStapled').equals(true),
          ],
        },
      })

      const payload = check.synthesize() as any
      expect(payload.request.assertions).toEqual([
        expect.objectContaining({ source: 'CERTIFICATE', property: 'keySizeBits', comparison: 'EQUALS', target: '2048' }),
        expect.objectContaining({ source: 'CONNECTION', property: 'tlsVersion', comparison: 'EQUALS', target: 'TLS1.3' }),
        expect.objectContaining({ source: 'CONNECTION', property: 'cipherSuite', comparison: 'EQUALS', target: 'TLS_AES_256_GCM_SHA384' }),
        expect.objectContaining({ source: 'CERTIFICATE', property: 'issuerCN', comparison: 'EQUALS', target: 'Let\'s Encrypt' }),
        expect.objectContaining({ source: 'CONNECTION', property: 'ocspStapled', comparison: 'EQUALS', target: 'true' }),
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

    it('should error on an unknown property for a property-scoped source', async () => {
      const diags = await validateWith([
        { source: 'CERTIFICATE', property: 'bogusProperty', comparison: 'EQUALS', target: 'x', regex: null },
      ] as unknown as SslRequest['assertions'])
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The CERTIFICATE assertion at "request.assertions[0]" has an unknown property "bogusProperty".',
          ),
        }),
      ]))
    })

    it('should error on a comparison the property does not allow', async () => {
      const diags = await validateWith([
        // certificate keySizeBits is numeric — CONTAINS is not allowed.
        { source: 'CERTIFICATE', property: 'keySizeBits', comparison: 'CONTAINS', target: '2048', regex: null },
      ])
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The CERTIFICATE "keySizeBits" assertion at "request.assertions[0]" has an unsupported comparison "CONTAINS".',
          ),
        }),
      ]))
    })

    it('should error on a comparison the source does not allow', async () => {
      const diags = await validateWith([
        // RESPONSE_TIME is numeric — CONTAINS is not allowed.
        { source: 'RESPONSE_TIME', property: '', comparison: 'CONTAINS', target: '100', regex: null },
      ])
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The RESPONSE_TIME assertion at "request.assertions[0]" has an unsupported comparison "CONTAINS".',
          ),
        }),
      ]))
    })

    it('should error on a boolean property with a non-boolean target', async () => {
      const diags = await validateWith([
        { source: 'CONNECTION', property: 'chainTrusted', comparison: 'EQUALS', target: 'yes', regex: null },
      ])
      expect(diags.isFatal()).toEqual(true)
      expect(diags.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'The CONNECTION "chainTrusted" assertion at "request.assertions[0]" must compare against "true" or "false", but got "yes".',
          ),
        }),
      ]))
    })

    it('should error on removed SSL-only operators against the new grammar', async () => {
      // The regex (MATCHES) and >= (GREATER_THAN_OR_EQUAL) operators were dropped for SSL;
      // they must be rejected on every source that could plausibly carry them.
      const cases: Array<{ assertion: SslRequest['assertions'][number]; message: string }> = [
        {
          assertion: { source: 'CERTIFICATE', property: 'signatureAlgorithm', comparison: 'MATCHES', target: 'x', regex: null },
          message: 'The CERTIFICATE "signatureAlgorithm" assertion at "request.assertions[0]" has an unsupported comparison "MATCHES".',
        },
        {
          assertion: { source: 'CONNECTION', property: 'tlsVersion', comparison: 'GREATER_THAN_OR_EQUAL', target: 'TLS1.2', regex: null },
          message: 'The CONNECTION "tlsVersion" assertion at "request.assertions[0]" has an unsupported comparison "GREATER_THAN_OR_EQUAL".',
        },
        {
          assertion: { source: 'RESPONSE_TIME', property: '', comparison: 'GREATER_THAN_OR_EQUAL', target: '100', regex: null },
          message: 'The RESPONSE_TIME assertion at "request.assertions[0]" has an unsupported comparison "GREATER_THAN_OR_EQUAL".',
        },
      ]
      for (const { assertion, message } of cases) {
        const diags = await validateWith([assertion])
        expect(diags.isFatal()).toEqual(true)
        expect(diags.observations).toEqual(expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining(message) }),
        ]))
      }
    })

    it('should enforce the per-property comparison whitelist', async () => {
      const cases: Array<{ assertion: SslRequest['assertions'][number]; message: string }> = [
        {
          // sans is STRING_LIST — only CONTAINS / NOT_CONTAINS, so EQUALS is rejected.
          assertion: { source: 'CERTIFICATE', property: 'sans', comparison: 'EQUALS', target: 'example.com', regex: null },
          message: 'The CERTIFICATE "sans" assertion at "request.assertions[0]" has an unsupported comparison "EQUALS".',
        },
        {
          // serialNumber is ID — only EQUALS / NOT_EQUALS, so CONTAINS is rejected.
          assertion: { source: 'CERTIFICATE', property: 'serialNumber', comparison: 'CONTAINS', target: 'ab', regex: null },
          message: 'The CERTIFICATE "serialNumber" assertion at "request.assertions[0]" has an unsupported comparison "CONTAINS".',
        },
        {
          // ocspStatus is ENUM — only EQUALS / NOT_EQUALS, so CONTAINS is rejected.
          assertion: { source: 'CONNECTION', property: 'ocspStatus', comparison: 'CONTAINS', target: 'good', regex: null },
          message: 'The CONNECTION "ocspStatus" assertion at "request.assertions[0]" has an unsupported comparison "CONTAINS".',
        },
      ]
      for (const { assertion, message } of cases) {
        const diags = await validateWith([assertion])
        expect(diags.isFatal()).toEqual(true)
        expect(diags.observations).toEqual(expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining(message) }),
        ]))
      }
    })

    it('should accept the list-oriented comparisons the whitelist allows', async () => {
      const diags = await validateWith([
        { source: 'CERTIFICATE', property: 'sans', comparison: 'CONTAINS', target: 'example.com', regex: null },
        { source: 'CONNECTION', property: 'resolvedIp', comparison: 'NOT_CONTAINS', target: '10.0.0.1', regex: null },
      ])
      expect(diags.isFatal()).toEqual(false)
    })

    it('should not error on assertions built with SslAssertionBuilder', async () => {
      const diags = await validateWith([
        SslAssertionBuilder.certificate('daysUntilExpiry').greaterThan(30),
        SslAssertionBuilder.certificate('keySizeBits').equals(2048),
        SslAssertionBuilder.certificate('issuerCN').contains('Let\'s Encrypt'),
        SslAssertionBuilder.certificate('signatureAlgorithm').equals('SHA256-RSA'),
        SslAssertionBuilder.certificate('selfSigned').equals(false),
        SslAssertionBuilder.connection('chainTrusted').equals(true),
        SslAssertionBuilder.connection('tlsVersion').equals('TLS1.3'),
        SslAssertionBuilder.connection('cipherSuite').notEquals('TLS_RSA_WITH_RC4_128_SHA'),
        SslAssertionBuilder.responseTime().lessThan(1000),
        SslAssertionBuilder.jsonResponse('$.status').equals('ok'),
        SslAssertionBuilder.textResponse().contains('healthy'),
      ])
      expect(diags.isFatal()).toEqual(false)
    })
  })
})
