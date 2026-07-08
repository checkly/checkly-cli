/**
 * Type-level tests for SslAssertionBuilder typed constants.
 *
 * These tests verify two things:
 * 1. Valid constant / string-literal values are accepted by the typed builders.
 * 2. Invalid strings are REJECTED at compile time (via @ts-expect-error).
 *
 * If the @ts-expect-error directives become "unused" in a future TypeScript
 * version it means the underlying typing was loosened — investigate before
 * removing them.
 */

import { describe, it, expect } from 'vitest'
import {
  SslAssertionBuilder,
  TlsVersion,
  CipherSuite,
  SignatureAlgorithm,
} from '../index.js'

describe('SslAssertionBuilder — typed target values', () => {
  describe('tlsVersion()', () => {
    it('accepts all TlsVersion constants', () => {
      expect(SslAssertionBuilder.tlsVersion().equals(TlsVersion.TLS1_0)).toBeTruthy()
      expect(SslAssertionBuilder.tlsVersion().equals(TlsVersion.TLS1_1)).toBeTruthy()
      expect(SslAssertionBuilder.tlsVersion().equals(TlsVersion.TLS1_2)).toBeTruthy()
      expect(SslAssertionBuilder.tlsVersion().equals(TlsVersion.TLS1_3)).toBeTruthy()
    })

    it('accepts TLS version string literals directly', () => {
      expect(SslAssertionBuilder.tlsVersion().greaterThanOrEqual('TLS1.2')).toBeTruthy()
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

  describe('signatureAlgorithm()', () => {
    it('accepts all SignatureAlgorithm constants (Go format)', () => {
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.SHA256_RSA)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.ECDSA_SHA256)).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.ED25519)).toBeTruthy()
    })

    it('accepts Go-format string literals directly', () => {
      expect(SslAssertionBuilder.signatureAlgorithm().equals('SHA256-RSA')).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().equals('ECDSA-SHA256')).toBeTruthy()
    })

    it('rejects OID-style strings (wrong format for the Go runner)', () => {
      // @ts-expect-error 'sha256WithRSAEncryption' is not assignable to SignatureAlgorithmValue
      SslAssertionBuilder.signatureAlgorithm().equals('sha256WithRSAEncryption')
    })

    it('rejects arbitrary strings', () => {
      // @ts-expect-error 'invalid-alg' is not assignable to SignatureAlgorithmValue
      SslAssertionBuilder.signatureAlgorithm().equals('invalid-alg')
    })

    it('still accepts any regex string via matches()', () => {
      // matches() is not constrained to SignatureAlgorithmValue — regex patterns are free-form
      expect(SslAssertionBuilder.signatureAlgorithm().matches('^ECDSA-.*')).toBeTruthy()
      expect(SslAssertionBuilder.signatureAlgorithm().matches('SHA256')).toBeTruthy()
    })
  })

  describe('cipherSuite()', () => {
    it('accepts all CipherSuite constants', () => {
      expect(SslAssertionBuilder.cipherSuite().equals(CipherSuite.TLS_AES_256_GCM_SHA384)).toBeTruthy()
      expect(SslAssertionBuilder.cipherSuite().equals(CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256)).toBeTruthy()
    })

    it('accepts known cipher suite string literals directly', () => {
      expect(SslAssertionBuilder.cipherSuite().equals('TLS_AES_256_GCM_SHA384')).toBeTruthy()
    })

    it('rejects arbitrary strings', () => {
      // @ts-expect-error 'not-a-cipher' is not assignable to CipherSuiteValue
      SslAssertionBuilder.cipherSuite().equals('not-a-cipher')
    })

    it('still accepts any regex string via matches()', () => {
      // matches() is not constrained to CipherSuiteValue
      expect(SslAssertionBuilder.cipherSuite().matches('^TLS_AES_.*')).toBeTruthy()
    })
  })
})
