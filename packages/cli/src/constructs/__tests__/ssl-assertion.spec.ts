/**
 * Type-level tests for SslAssertionBuilder typed constants.
 *
 * These tests verify two things:
 * 1. Valid constant / string-literal values are accepted by the typed builders.
 * 2. Invalid strings are REJECTED at compile time (via @ts-expect-error) where
 *    the builder is strictly typed.
 *
 * If a @ts-expect-error directive becomes "unused" it means the underlying typing
 * was loosened — investigate before removing it.
 */

import { describe, it, expect } from 'vitest'
import {
  SslAssertionBuilder,
  TlsVersion,
  CipherSuite,
  SignatureAlgorithm,
} from '../index.js'

describe('SslAssertionBuilder — typed target values', () => {
  describe('tlsVersion() — strict 4-value union', () => {
    it('accepts all TlsVersion constants', () => {
      expect(SslAssertionBuilder.tlsVersion().equals(TlsVersion.TLS1_0)).toBeTruthy()
      expect(SslAssertionBuilder.tlsVersion().equals(TlsVersion.TLS1_1)).toBeTruthy()
      expect(SslAssertionBuilder.tlsVersion().equals(TlsVersion.TLS1_2)).toBeTruthy()
      expect(SslAssertionBuilder.tlsVersion().equals(TlsVersion.TLS1_3)).toBeTruthy()
    })

    it('accepts TLS version string literals directly', () => {
      expect(SslAssertionBuilder.tlsVersion().equals('TLS1.2')).toBeTruthy()
      expect(SslAssertionBuilder.tlsVersion().equals('TLS1.3')).toBeTruthy()
    })

    it('rejects an arbitrary string that is not a valid TLS version', () => {
      // @ts-expect-error 'not-a-tls-version' is not assignable to TlsVersionValue
      SslAssertionBuilder.tlsVersion().equals('not-a-tls-version')
    })

    it('rejects a numeric TLS version (wrong type)', () => {
      // @ts-expect-error number is not assignable to TlsVersionValue
      SslAssertionBuilder.tlsVersion().equals(1.3)
    })
  })

  describe('signatureAlgorithm() — complete Go x509.SignatureAlgorithm.String() union', () => {
    it('accepts all SignatureAlgorithm constants (Go format)', () => {
      // RSA family
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.MD2_RSA)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.MD5_RSA)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.SHA1_RSA)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.SHA256_RSA)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.SHA384_RSA)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.SHA512_RSA)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.SHA256_RSAPSS)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.SHA384_RSAPSS)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.SHA512_RSAPSS)).toBeTruthy()
      // DSA family
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.DSA_SHA1)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.DSA_SHA256)).toBeTruthy()
      // ECDSA family
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.ECDSA_SHA1)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.ECDSA_SHA256)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.ECDSA_SHA384)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.ECDSA_SHA512)).toBeTruthy()
      // EdDSA
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.ED25519)).toBeTruthy()
    })

    it('accepts Go-format string literals directly', () => {
      expect(SslAssertionBuilder.signatureAlgorithm().equals('SHA256-RSA')).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals('ECDSA-SHA256')).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals('Ed25519')).toBeTruthy()
    })

    it('rejects OID-style strings (wrong format — the runner uses Go String() not OID names)', () => {
      // @ts-expect-error 'sha256WithRSAEncryption' is not assignable to SignatureAlgorithmValue
      SslAssertionBuilder.signatureAlgorithm().equals('sha256WithRSAEncryption')
    })

    it('rejects arbitrary strings', () => {
      // @ts-expect-error 'invalid-alg' is not assignable to SignatureAlgorithmValue
      SslAssertionBuilder.signatureAlgorithm().equals('invalid-alg')
    })
  })

  describe('cipherSuite() — intentionally unconstrained (open-ended IANA set)', () => {
    it('accepts CipherSuite constants for common suites', () => {
      expect(SslAssertionBuilder.cipherSuite().equals(CipherSuite.TLS_AES_256_GCM_SHA384)).toBeTruthy()
      expect(SslAssertionBuilder.cipherSuite().equals(CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256)).toBeTruthy()
    })

    it('accepts any string — including suites not in the CipherSuite constant list', () => {
      // These are valid Go tls.CipherSuiteName() outputs that exceed the short constant list
      expect(SslAssertionBuilder.cipherSuite().equals('TLS_RSA_WITH_RC4_128_SHA')).toBeTruthy()
      expect(SslAssertionBuilder.cipherSuite().equals('TLS_RSA_WITH_3DES_EDE_CBC_SHA')).toBeTruthy()
      expect(SslAssertionBuilder.cipherSuite().notEquals('TLS_RSA_WITH_RC4_128_SHA')).toBeTruthy()
      expect(SslAssertionBuilder.cipherSuite().equals('TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256')).toBeTruthy()
    })
  })

  describe('matches() — regex operator on the string sources', () => {
    it('produces a MATCHES assertion for cipherSuite / issuerCn / signatureAlgorithm', () => {
      expect(SslAssertionBuilder.cipherSuite().matches('TLS_(AES|CHACHA)')).toMatchObject({
        source: 'CIPHER_SUITE', comparison: 'MATCHES', target: 'TLS_(AES|CHACHA)',
      })
      expect(SslAssertionBuilder.issuerCn().matches('^Let\'s Encrypt')).toMatchObject({
        source: 'ISSUER_CN', comparison: 'MATCHES', target: '^Let\'s Encrypt',
      })
      expect(SslAssertionBuilder.signatureAlgorithm().matches('SHA(256|384)')).toMatchObject({
        source: 'SIGNATURE_ALGORITHM', comparison: 'MATCHES', target: 'SHA(256|384)',
      })
    })
  })

  describe('per-source builders reject operators the backend does not allow', () => {
    it('rejects them at compile time', () => {
      // Compile-time-only checks: the removed methods do not exist at runtime, so the
      // body is type-checked but never executed (an uncalled function).

      const _typeChecks = () => {
        // keySizeBits supports EQUALS only (GREATER_THAN_OR_EQUAL was dropped)
        // @ts-expect-error greaterThan is not available on the key-size builder
        SslAssertionBuilder.keySizeBits().greaterThan(2048)
        // @ts-expect-error notEquals is not available on the key-size builder
        SslAssertionBuilder.keySizeBits().notEquals(2048)
        // boolean sources take a boolean, not the string 'true'
        // @ts-expect-error 'true' (string) is not assignable to boolean
        SslAssertionBuilder.certNotExpired().equals('true')
        // matches is not offered on non-string sources
        // @ts-expect-error matches is not available on the cert-not-expired builder
        SslAssertionBuilder.certNotExpired().matches('x')
        // the general string operators are not offered on SSL string sources
        // @ts-expect-error contains is not available on the cipher-suite builder
        SslAssertionBuilder.cipherSuite().contains('x')
        // tlsVersion supports EQUALS only
        // @ts-expect-error notEquals is not available on the tls-version builder
        SslAssertionBuilder.tlsVersion().notEquals('TLS1.3')
      }
      expect(_typeChecks).toBeDefined()
    })
  })
})
