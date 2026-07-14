import {
  Assertion as CoreAssertion,
  GeneralAssertionBuilder,
  NumericAssertionBuilder,
} from './internal/assertion.js'

/**
 * Known TLS protocol versions for use as a target of the `tlsVersion` property on
 * the {@link SslAssertionBuilder.connection} builder.
 *
 * @example
 * ```typescript
 * SslAssertionBuilder.connection('tlsVersion').equals(TlsVersion.TLS1_3)
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
 * constants (or the string literals they represent) as a target of the
 * `signatureAlgorithm` property on the {@link SslAssertionBuilder.certificate} builder.
 *
 * @example
 * ```typescript
 * SslAssertionBuilder.certificate('signatureAlgorithm').equals(SignatureAlgorithm.SHA256_RSA)
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
 * Commonly-used IANA cipher suite names for use as a target of the `cipherSuite`
 * property on the {@link SslAssertionBuilder.connection} builder. Includes TLS 1.3
 * suites and widely-deployed TLS 1.2 suites.
 *
 * @example
 * ```typescript
 * SslAssertionBuilder.connection('cipherSuite').equals(CipherSuite.TLS_AES_256_GCM_SHA384)
 * SslAssertionBuilder.connection('cipherSuite').equals(CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256)
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

// Property-scoped SSL assertion sources. Certificate and connection facts are
// addressed by a `property` name (e.g. 'daysUntilExpiry', 'tlsVersion'); the
// remaining sources mirror the API check grammar.
type SslAssertionSource =
  | 'CERTIFICATE'
  | 'CONNECTION'
  | 'RESPONSE_TIME'
  | 'JSON_RESPONSE'
  | 'TEXT_RESPONSE'

export type SslAssertion = CoreAssertion<SslAssertionSource>

// The certificate/connection property names the backend understands. Narrowing the
// `property` parameter to these unions turns a typo into a compile error and drives
// autocomplete. The runtime whitelist in ssl-assertion-validation.ts is the source of
// truth for object-literal assertions that bypass the builder.
type CertificateProperty =
  | 'daysUntilExpiry'
  | 'subjectCN'
  | 'issuerCN'
  | 'serialNumber'
  | 'fingerprintSha256'
  | 'issuerFingerprintSha256'
  | 'keySizeBits'
  | 'keyAlgorithm'
  | 'signatureAlgorithm'
  | 'sans'
  | 'selfSigned'
  | 'isCA'

type ConnectionProperty =
  | 'tlsVersion'
  | 'cipherSuite'
  | 'hostnameVerified'
  | 'chainTrusted'
  | 'ocspStapled'
  | 'ocspStatus'
  | 'resolvedIp'

/**
 * Builder class for creating SSL monitor assertions.
 *
 * Assertions are property-scoped: {@link certificate} and {@link connection} take the
 * name of a certificate/connection property, {@link jsonResponse} takes a JSONPath and
 * {@link textResponse} an optional regex. The comparison operators the backend accepts
 * depend on the property's value type and are validated at deploy time.
 *
 * @example
 * ```typescript
 * // Certificate facts, addressed by property name
 * SslAssertionBuilder.certificate('daysUntilExpiry').greaterThan(30)
 * SslAssertionBuilder.certificate('issuerCN').contains("Let's Encrypt")
 * SslAssertionBuilder.certificate('signatureAlgorithm').equals(SignatureAlgorithm.SHA256_RSA)
 * SslAssertionBuilder.certificate('selfSigned').equals(false)
 *
 * // Connection / handshake facts
 * SslAssertionBuilder.connection('tlsVersion').equals(TlsVersion.TLS1_3)
 * SslAssertionBuilder.connection('cipherSuite').equals(CipherSuite.TLS_AES_256_GCM_SHA384)
 * SslAssertionBuilder.connection('chainTrusted').equals(true)
 *
 * // Response time, JSON and text responses
 * SslAssertionBuilder.responseTime().lessThan(1000)
 * SslAssertionBuilder.jsonResponse('$.status').equals('ok')
 * SslAssertionBuilder.textResponse().contains('healthy')
 * ```
 */
export class SslAssertionBuilder {
  /**
   * Creates an assertion builder for a certificate property.
   * @param property The certificate property to assert on (e.g. `'daysUntilExpiry'`,
   *   `'issuerCN'`, `'signatureAlgorithm'`, `'sans'`, `'selfSigned'`).
   */
  static certificate (property: 'signatureAlgorithm'): GeneralAssertionBuilder<SslAssertionSource, SignatureAlgorithmValue>
  static certificate (property: CertificateProperty): GeneralAssertionBuilder<SslAssertionSource>
  static certificate (property: CertificateProperty) {
    return new GeneralAssertionBuilder<SslAssertionSource>('CERTIFICATE', property)
  }

  /**
   * Creates an assertion builder for a connection property.
   * @param property The connection property to assert on (e.g. `'tlsVersion'`,
   *   `'cipherSuite'`, `'hostnameVerified'`, `'ocspStatus'`, `'resolvedIp'`).
   */
  static connection (property: 'tlsVersion'): GeneralAssertionBuilder<SslAssertionSource, TlsVersionValue>
  static connection (property: ConnectionProperty): GeneralAssertionBuilder<SslAssertionSource>
  static connection (property: ConnectionProperty) {
    return new GeneralAssertionBuilder<SslAssertionSource>('CONNECTION', property)
  }

  /**
   * Creates an assertion builder for the TLS handshake response time in milliseconds.
   */
  static responseTime () {
    return new NumericAssertionBuilder<SslAssertionSource>('RESPONSE_TIME')
  }

  /**
   * Creates an assertion builder for a JSON response body.
   * @param property Optional JSONPath to a specific value (e.g. `'$.status'`).
   */
  static jsonResponse (property?: string) {
    return new GeneralAssertionBuilder<SslAssertionSource>('JSON_RESPONSE', property)
  }

  /**
   * Creates an assertion builder for a text response body.
   * @param regex Optional regex pattern applied to the response text before comparison.
   */
  static textResponse (regex?: string) {
    return new GeneralAssertionBuilder<SslAssertionSource>('TEXT_RESPONSE', undefined, regex)
  }
}
