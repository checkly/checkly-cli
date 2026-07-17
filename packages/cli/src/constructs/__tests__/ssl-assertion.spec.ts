/**
 * Tests for the property-scoped SslAssertionBuilder.
 *
 * The builder mirrors the API check grammar: `certificate` / `connection` take a
 * property name, `jsonResponse` a JSONPath and `textResponse` an optional regex. The
 * exported TlsVersion / SignatureAlgorithm / CipherSuite constant maps are usable as
 * assertion targets.
 */

import { describe, it, expect } from 'vitest'
import {
  SslAssertionBuilder,
  TlsVersion,
  CipherSuite,
  SignatureAlgorithm,
} from '../index.js'

describe('SslAssertionBuilder', () => {
  describe('certificate(property)', () => {
    it('builds numeric certificate assertions', () => {
      expect(SslAssertionBuilder.certificate('daysUntilExpiry').greaterThan(30)).toMatchObject({
        source: 'CERTIFICATE', property: 'daysUntilExpiry', comparison: 'GREATER_THAN', target: '30',
      })
      expect(SslAssertionBuilder.certificate('keySizeBits').equals(2048)).toMatchObject({
        source: 'CERTIFICATE', property: 'keySizeBits', comparison: 'EQUALS', target: '2048',
      })
    })

    it('builds string certificate assertions', () => {
      expect(SslAssertionBuilder.certificate('issuerCN').contains('Let\'s Encrypt')).toMatchObject({
        source: 'CERTIFICATE', property: 'issuerCN', comparison: 'CONTAINS', target: 'Let\'s Encrypt',
      })
      expect(SslAssertionBuilder.certificate('sans').notContains('evil.example.com')).toMatchObject({
        source: 'CERTIFICATE', property: 'sans', comparison: 'NOT_CONTAINS', target: 'evil.example.com',
      })
    })

    it('accepts a SignatureAlgorithm constant as a target', () => {
      expect(SslAssertionBuilder.certificate('signatureAlgorithm').equals(SignatureAlgorithm.SHA256_RSA)).toMatchObject({
        source: 'CERTIFICATE', property: 'signatureAlgorithm', comparison: 'EQUALS', target: 'SHA256-RSA',
      })
    })

    it('builds boolean certificate assertions', () => {
      expect(SslAssertionBuilder.certificate('selfSigned').equals(false)).toMatchObject({
        source: 'CERTIFICATE', property: 'selfSigned', comparison: 'EQUALS', target: 'false',
      })
      expect(SslAssertionBuilder.certificate('isCA').equals(true)).toMatchObject({
        source: 'CERTIFICATE', property: 'isCA', comparison: 'EQUALS', target: 'true',
      })
    })

    // Numeric and boolean targets are narrowed at compile time, so the wire payload is
    // the only place a wrong-typed target could still surface. These run under vitest
    // and hold regardless of whether the type-level cases above are ever checked.
    it('stringifies typed targets onto the wire', () => {
      expect(SslAssertionBuilder.certificate('daysUntilExpiry').greaterThan(30).target).toEqual('30')
      expect(SslAssertionBuilder.certificate('keySizeBits').equals(2048).target).toEqual('2048')
      expect(SslAssertionBuilder.certificate('selfSigned').equals(false).target).toEqual('false')
      expect(SslAssertionBuilder.connection('chainTrusted').equals(true).target).toEqual('true')
    })
  })

  describe('connection(property)', () => {
    it('accepts a TlsVersion constant as a target', () => {
      expect(SslAssertionBuilder.connection('tlsVersion').equals(TlsVersion.TLS1_3)).toMatchObject({
        source: 'CONNECTION', property: 'tlsVersion', comparison: 'EQUALS', target: 'TLS1.3',
      })
      expect(SslAssertionBuilder.connection('tlsVersion').greaterThan(TlsVersion.TLS1_2)).toMatchObject({
        source: 'CONNECTION', property: 'tlsVersion', comparison: 'GREATER_THAN', target: 'TLS1.2',
      })
    })

    it('accepts a CipherSuite constant as a target', () => {
      expect(SslAssertionBuilder.connection('cipherSuite').equals(CipherSuite.TLS_AES_256_GCM_SHA384)).toMatchObject({
        source: 'CONNECTION', property: 'cipherSuite', comparison: 'EQUALS', target: 'TLS_AES_256_GCM_SHA384',
      })
    })

    it('builds boolean connection assertions', () => {
      expect(SslAssertionBuilder.connection('chainTrusted').equals(true)).toMatchObject({
        source: 'CONNECTION', property: 'chainTrusted', comparison: 'EQUALS', target: 'true',
      })
      expect(SslAssertionBuilder.connection('hostnameVerified').equals(true)).toMatchObject({
        source: 'CONNECTION', property: 'hostnameVerified', comparison: 'EQUALS', target: 'true',
      })
    })

    it('builds a resolvedIp contains assertion', () => {
      expect(SslAssertionBuilder.connection('resolvedIp').contains('93.184')).toMatchObject({
        source: 'CONNECTION', property: 'resolvedIp', comparison: 'CONTAINS', target: '93.184',
      })
    })
  })

  describe('responseTime()', () => {
    it('builds a numeric response-time assertion without a property', () => {
      expect(SslAssertionBuilder.responseTime().lessThan(1000)).toMatchObject({
        source: 'RESPONSE_TIME', property: '', comparison: 'LESS_THAN', target: '1000',
      })
    })
  })

  describe('jsonResponse(property)', () => {
    it('builds a JSONPath-scoped assertion', () => {
      expect(SslAssertionBuilder.jsonResponse('$.status').equals('ok')).toMatchObject({
        source: 'JSON_RESPONSE', property: '$.status', comparison: 'EQUALS', target: 'ok',
      })
      expect(SslAssertionBuilder.jsonResponse('$.data').isNotNull()).toMatchObject({
        source: 'JSON_RESPONSE', property: '$.data', comparison: 'NOT_NULL',
      })
    })
  })

  describe('textResponse(regex)', () => {
    it('builds a text-response assertion, optionally scoped by regex', () => {
      expect(SslAssertionBuilder.textResponse().contains('healthy')).toMatchObject({
        source: 'TEXT_RESPONSE', property: '', comparison: 'CONTAINS', target: 'healthy', regex: null,
      })
      // The pattern rides in `property` — the slot the backend Joi schema and the
      // go-runner (EvaluateRegExp) read the TEXT_RESPONSE pattern from; `regex` is dead.
      expect(SslAssertionBuilder.textResponse('status: (\\w+)').equals('ok')).toMatchObject({
        source: 'TEXT_RESPONSE', property: 'status: (\\w+)', comparison: 'EQUALS', target: 'ok', regex: null,
      })
    })
  })

  // The `@ts-expect-error` lines below document the intended narrowing but currently
  // assert nothing: tsconfig.json excludes `src/**/__tests__` and vitest does not
  // type-check, so no build step ever evaluates them. RED-739 tracks wiring that up.
  // Until it lands, only the runtime `expect` calls here are enforced.
  describe('type narrowing (compile-time)', () => {
    it('constrains connection(tlsVersion) targets to TlsVersionValue', () => {
      expect(SslAssertionBuilder.connection('tlsVersion').equals(TlsVersion.TLS1_3)).toMatchObject({
        source: 'CONNECTION', property: 'tlsVersion', comparison: 'EQUALS', target: 'TLS1.3',
      })
      // @ts-expect-error 'bogus' is not a TlsVersionValue
      SslAssertionBuilder.connection('tlsVersion').equals('bogus')
    })

    it('constrains certificate(signatureAlgorithm) targets to SignatureAlgorithmValue', () => {
      expect(SslAssertionBuilder.certificate('signatureAlgorithm').equals(SignatureAlgorithm.SHA256_RSA)).toMatchObject({
        source: 'CERTIFICATE', property: 'signatureAlgorithm', comparison: 'EQUALS', target: 'SHA256-RSA',
      })
      // @ts-expect-error 'nope' is not a SignatureAlgorithmValue
      SslAssertionBuilder.certificate('signatureAlgorithm').equals('nope')
    })

    it('rejects unknown property names', () => {
      // @ts-expect-error 'bogusProperty' is not an SslCertificateProperty
      SslAssertionBuilder.certificate('bogusProperty')
      // @ts-expect-error 'bogusProperty' is not an SslConnectionProperty
      SslAssertionBuilder.connection('bogusProperty')
    })

    it('constrains numeric certificate properties to number targets', () => {
      // @ts-expect-error a numeric property does not take a string target
      SslAssertionBuilder.certificate('daysUntilExpiry').greaterThan('30 days')
      // @ts-expect-error a numeric property does not take a boolean target
      SslAssertionBuilder.certificate('keySizeBits').equals(true)
    })

    it('constrains boolean properties to boolean targets', () => {
      // @ts-expect-error a boolean property does not take a string target
      SslAssertionBuilder.certificate('selfSigned').equals('yes')
      // @ts-expect-error a boolean property does not take a string target
      SslAssertionBuilder.connection('chainTrusted').equals('yes')
    })

    // Each property exposes only the operators the backend accepts for its value type,
    // so an unsupported comparison is a compile error rather than a deploy diagnostic.
    it('offers only the operators a property supports', () => {
      // These operators do not exist at runtime, so the body is type-checked but never
      // executed (an uncalled function) — calling it would throw a TypeError.
      const _typeChecks = () => {
        // @ts-expect-error a boolean property supports EQUALS only
        SslAssertionBuilder.certificate('selfSigned').notEquals(true)
        // @ts-expect-error a numeric property is not substring-matched
        SslAssertionBuilder.certificate('keySizeBits').contains('20')
        // @ts-expect-error an opaque identifier is not substring-matched
        SslAssertionBuilder.certificate('fingerprintSha256').contains('ab')
        // @ts-expect-error a string list has no whole-value to compare against
        SslAssertionBuilder.certificate('sans').equals('example.com')
        // @ts-expect-error an enum is not ordered
        SslAssertionBuilder.certificate('signatureAlgorithm').greaterThan('SHA256-RSA')
        // @ts-expect-error a free-form string is not ordered
        SslAssertionBuilder.connection('cipherSuite').greaterThan('TLS_AES_256_GCM_SHA384')
      }
      expect(_typeChecks).toBeDefined()
    })

    it('allows the operators a property does support', () => {
      expect(SslAssertionBuilder.connection('tlsVersion').greaterThan(TlsVersion.TLS1_2)).toMatchObject({
        source: 'CONNECTION', property: 'tlsVersion', comparison: 'GREATER_THAN', target: 'TLS1.2',
      })
      expect(SslAssertionBuilder.certificate('sans').notContains('evil.example.com')).toMatchObject({
        source: 'CERTIFICATE', property: 'sans', comparison: 'NOT_CONTAINS', target: 'evil.example.com',
      })
      expect(SslAssertionBuilder.certificate('serialNumber').notEquals('ab12')).toMatchObject({
        source: 'CERTIFICATE', property: 'serialNumber', comparison: 'NOT_EQUALS', target: 'ab12',
      })
    })

    it('leaves cipherSuite targets unconstrained (arbitrary string)', () => {
      expect(SslAssertionBuilder.connection('cipherSuite').equals('SOME_FUTURE_SUITE')).toMatchObject({
        source: 'CONNECTION', property: 'cipherSuite', comparison: 'EQUALS', target: 'SOME_FUTURE_SUITE',
      })
    })
  })
})
