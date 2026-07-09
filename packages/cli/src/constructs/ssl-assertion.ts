import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder } from './internal/assertion.js'

/**
 * Known TLS protocol versions for use with {@link SslAssertionBuilder.tlsVersion}.
 *
 * @example
 * ```typescript
 * SslAssertionBuilder.tlsVersion().equals(TlsVersion.TLS1_3)
 * ```
 */
export const TlsVersion = {
  TLS1_0: 'TLS1.0',
  TLS1_1: 'TLS1.1',
  TLS1_2: 'TLS1.2',
  TLS1_3: 'TLS1.3',
} as const

export type TlsVersionValue = (typeof TlsVersion)[keyof typeof TlsVersion]

/**
 * Signature algorithms as reported by Go's `x509.Certificate.SignatureAlgorithm.String()`.
 * These are the exact values the SSL runner evaluates assertions against — use these
 * constants (or the string literals they represent) with {@link SslAssertionBuilder.signatureAlgorithm}.
 *
 * @example
 * ```typescript
 * SslAssertionBuilder.signatureAlgorithm().equals(SignatureAlgorithm.SHA256_RSA)
 * ```
 */
export const SignatureAlgorithm = {
  // RSA
  MD2_RSA: 'MD2-RSA',
  MD5_RSA: 'MD5-RSA',
  SHA1_RSA: 'SHA1-RSA',
  SHA256_RSA: 'SHA256-RSA',
  SHA384_RSA: 'SHA384-RSA',
  SHA512_RSA: 'SHA512-RSA',
  SHA256_RSAPSS: 'SHA256-RSAPSS',
  SHA384_RSAPSS: 'SHA384-RSAPSS',
  SHA512_RSAPSS: 'SHA512-RSAPSS',
  // DSA
  DSA_SHA1: 'DSA-SHA1',
  DSA_SHA256: 'DSA-SHA256',
  // ECDSA
  ECDSA_SHA1: 'ECDSA-SHA1',
  ECDSA_SHA256: 'ECDSA-SHA256',
  ECDSA_SHA384: 'ECDSA-SHA384',
  ECDSA_SHA512: 'ECDSA-SHA512',
  // EdDSA
  ED25519: 'Ed25519',
} as const

export type SignatureAlgorithmValue = (typeof SignatureAlgorithm)[keyof typeof SignatureAlgorithm]

/**
 * Commonly-used IANA cipher suite names for use with
 * {@link SslAssertionBuilder.cipherSuite}. Includes TLS 1.3 suites and
 * widely-deployed TLS 1.2 suites.
 *
 * @example
 * ```typescript
 * SslAssertionBuilder.cipherSuite().equals(CipherSuite.TLS_AES_256_GCM_SHA384)
 * SslAssertionBuilder.cipherSuite().equals(CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256)
 * ```
 */
export const CipherSuite = {
  // TLS 1.3
  TLS_AES_128_GCM_SHA256: 'TLS_AES_128_GCM_SHA256',
  TLS_AES_256_GCM_SHA384: 'TLS_AES_256_GCM_SHA384',
  TLS_CHACHA20_POLY1305_SHA256: 'TLS_CHACHA20_POLY1305_SHA256',
  // TLS 1.2 — ECDHE (forward-secret, preferred)
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256: 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384: 'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
  TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256: 'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256',
  TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384: 'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384',
  TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256: 'TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256',
  TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256: 'TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256',
  // TLS 1.2 — RSA key exchange
  TLS_RSA_WITH_AES_128_GCM_SHA256: 'TLS_RSA_WITH_AES_128_GCM_SHA256',
  TLS_RSA_WITH_AES_256_GCM_SHA384: 'TLS_RSA_WITH_AES_256_GCM_SHA384',
  TLS_RSA_WITH_AES_128_CBC_SHA256: 'TLS_RSA_WITH_AES_128_CBC_SHA256',
  TLS_RSA_WITH_AES_256_CBC_SHA256: 'TLS_RSA_WITH_AES_256_CBC_SHA256',
  TLS_RSA_WITH_AES_128_CBC_SHA: 'TLS_RSA_WITH_AES_128_CBC_SHA',
  TLS_RSA_WITH_AES_256_CBC_SHA: 'TLS_RSA_WITH_AES_256_CBC_SHA',
} as const

export type CipherSuiteValue = (typeof CipherSuite)[keyof typeof CipherSuite]

type SslAssertionSource =
  | 'CERT_EXPIRES_IN_DAYS'
  | 'CERT_NOT_EXPIRED'
  | 'HOSTNAME_VERIFIED'
  | 'CHAIN_TRUSTED'
  | 'TLS_VERSION'
  | 'CIPHER_SUITE'
  | 'ISSUER_CN'
  | 'CERT_FINGERPRINT_SHA256'
  | 'ISSUER_FINGERPRINT_SHA256'
  | 'KEY_SIZE_BITS'
  | 'SIGNATURE_ALGORITHM'
  | 'OCSP_STAPLED'
  | 'HANDSHAKE_TIME_MS'
  | 'SAN_CONTAINS'

export type SslAssertion = CoreAssertion<SslAssertionSource>

/**
 * Builder class for creating SSL monitor assertions.
 * Provides methods to create assertions for TLS certificates.
 *
 * @example
 * ```typescript
 * // Alert when the certificate is within 30 days of expiry
 * SslAssertionBuilder.certExpiresInDays().greaterThan(30)
 *
 * // Require a trusted chain and a verified hostname
 * SslAssertionBuilder.chainTrusted().equals(true)
 * SslAssertionBuilder.hostnameVerified().equals(true)
 *
 * // Enforce a minimum TLS version and key size
 * SslAssertionBuilder.tlsVersion().equals('TLS1.3')
 * SslAssertionBuilder.keySizeBits().greaterThan(2048)
 * ```
 */
export class SslAssertionBuilder {
  /**
   * Creates an assertion builder for the number of days until the certificate
   * expires.
   * @returns A numeric assertion builder for days until expiry.
   */
  static certExpiresInDays () {
    return new NumericAssertionBuilder<SslAssertionSource>('CERT_EXPIRES_IN_DAYS')
  }

  /**
   * Creates an assertion builder for the certificate key size in bits.
   * @returns A numeric assertion builder for the key size.
   */
  static keySizeBits () {
    return new NumericAssertionBuilder<SslAssertionSource>('KEY_SIZE_BITS')
  }

  /**
   * Creates an assertion builder for whether the certificate is not expired.
   * @returns A general assertion builder for the expiry status.
   */
  static certNotExpired () {
    return new GeneralAssertionBuilder<SslAssertionSource>('CERT_NOT_EXPIRED')
  }

  /**
   * Creates an assertion builder for whether the hostname is verified.
   * @returns A general assertion builder for the hostname verification status.
   */
  static hostnameVerified () {
    return new GeneralAssertionBuilder<SslAssertionSource>('HOSTNAME_VERIFIED')
  }

  /**
   * Creates an assertion builder for whether the certificate chain is trusted.
   * @returns A general assertion builder for the chain trust status.
   */
  static chainTrusted () {
    return new GeneralAssertionBuilder<SslAssertionSource>('CHAIN_TRUSTED')
  }

  /**
   * Creates an assertion builder for the negotiated TLS version.
   * The `.equals()` method accepts only the
   * known TLS version strings — use the {@link TlsVersion} constants or
   * the string literals `'TLS1.0'`…`'TLS1.3'`.
   * @returns A typed assertion builder for the TLS version.
   */
  static tlsVersion (): GeneralAssertionBuilder<SslAssertionSource, TlsVersionValue> {
    return new GeneralAssertionBuilder<SslAssertionSource, TlsVersionValue>('TLS_VERSION')
  }

  /**
   * Creates an assertion builder for the negotiated cipher suite.
   * Go's `tls.CipherSuiteName()` can return hundreds of IANA names plus
   * `0x....` hex fallbacks, so this builder is intentionally unconstrained.
   * Use the {@link CipherSuite} constants for common suites (autocomplete),
   * or pass any string literal / regex pattern as needed.
   * @returns An unconstrained assertion builder for the cipher suite.
   */
  static cipherSuite (): GeneralAssertionBuilder<SslAssertionSource> {
    return new GeneralAssertionBuilder<SslAssertionSource>('CIPHER_SUITE')
  }

  /**
   * Creates an assertion builder for the certificate issuer common name.
   * @returns A general assertion builder for the issuer CN.
   */
  static issuerCn () {
    return new GeneralAssertionBuilder<SslAssertionSource>('ISSUER_CN')
  }

  /**
   * Creates an assertion builder for the certificate SHA-256 fingerprint.
   * @returns A general assertion builder for the certificate fingerprint.
   */
  static certFingerprintSha256 () {
    return new GeneralAssertionBuilder<SslAssertionSource>('CERT_FINGERPRINT_SHA256')
  }

  /**
   * Creates an assertion builder for the issuer SHA-256 fingerprint.
   * @returns A general assertion builder for the issuer fingerprint.
   */
  static issuerFingerprintSha256 () {
    return new GeneralAssertionBuilder<SslAssertionSource>('ISSUER_FINGERPRINT_SHA256')
  }

  /**
   * Creates an assertion builder for the certificate signature algorithm.
   * Values are Go's `x509.Certificate.SignatureAlgorithm.String()` output
   * (e.g. `'SHA256-RSA'`, `'ECDSA-SHA256'`). Use the {@link SignatureAlgorithm}
   * constants or those string literals with `.equals()`.
   * @returns A typed assertion builder for the signature algorithm.
   */
  static signatureAlgorithm (): GeneralAssertionBuilder<SslAssertionSource, SignatureAlgorithmValue> {
    return new GeneralAssertionBuilder<SslAssertionSource, SignatureAlgorithmValue>('SIGNATURE_ALGORITHM')
  }

  /**
   * Creates an assertion builder for whether a stapled OCSP response was
   * provided during the handshake.
   * @returns A general assertion builder for the OCSP-stapled status.
   */
  static ocspStapled () {
    return new GeneralAssertionBuilder<SslAssertionSource>('OCSP_STAPLED')
  }

  /**
   * Creates an assertion builder for the TLS handshake time in milliseconds.
   * @returns A numeric assertion builder for the handshake time.
   */
  static handshakeTimeMs () {
    return new NumericAssertionBuilder<SslAssertionSource>('HANDSHAKE_TIME_MS')
  }

  /**
   * Creates an assertion builder for the certificate subject alternative names
   * (SANs).
   * @returns A general assertion builder for the SAN entries.
   */
  static sanContains () {
    return new GeneralAssertionBuilder<SslAssertionSource>('SAN_CONTAINS')
  }
}
