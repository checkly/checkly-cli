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
      expect(SslAssertionBuilder.textResponse('status: (\\w+)').equals('ok')).toMatchObject({
        source: 'TEXT_RESPONSE', property: '', comparison: 'EQUALS', target: 'ok', regex: 'status: (\\w+)',
      })
    })
  })

  // These cases assert compile-time narrowing. The `@ts-expect-error` lines are the
  // real assertions: `tsc --build` fails if any becomes a false positive (an unused
  // expect-error). The runtime `expect` keeps the block a valid test.
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
      // @ts-expect-error 'bogusProperty' is not a CertificateProperty
      SslAssertionBuilder.certificate('bogusProperty')
      // @ts-expect-error 'bogusProperty' is not a ConnectionProperty
      SslAssertionBuilder.connection('bogusProperty')
    })

    it('leaves cipherSuite targets unconstrained (arbitrary string)', () => {
      expect(SslAssertionBuilder.connection('cipherSuite').equals('SOME_FUTURE_SUITE')).toMatchObject({
        source: 'CONNECTION', property: 'cipherSuite', comparison: 'EQUALS', target: 'SOME_FUTURE_SUITE',
      })
    })
  })
})
