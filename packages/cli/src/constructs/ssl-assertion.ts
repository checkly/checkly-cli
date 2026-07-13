import { Assertion as CoreAssertion, toAssertion } from './internal/assertion.js'

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

export type SslAssertion = CoreAssertion<SslAssertionSource>

// One builder class per SSL source, each exposing only the operators (and value
// type) the backend accepts for that source. The classes are stateless — the source
// is baked into each `toAssertion` call — and are not exported: they are reachable
// only through `SslAssertionBuilder`, so they stay out of the package's public API.

/** Days until the certificate expires (numeric). */
class CertExpiresInDaysAssertionBuilder {
  equals (target: number): SslAssertion {
    return toAssertion('CERT_EXPIRES_IN_DAYS', 'EQUALS', target)
  }

  notEquals (target: number): SslAssertion {
    return toAssertion('CERT_EXPIRES_IN_DAYS', 'NOT_EQUALS', target)
  }

  lessThan (target: number): SslAssertion {
    return toAssertion('CERT_EXPIRES_IN_DAYS', 'LESS_THAN', target)
  }

  greaterThan (target: number): SslAssertion {
    return toAssertion('CERT_EXPIRES_IN_DAYS', 'GREATER_THAN', target)
  }
}

/** Certificate key size in bits (numeric, exact match only). */
class KeySizeBitsAssertionBuilder {
  equals (target: number): SslAssertion {
    return toAssertion('KEY_SIZE_BITS', 'EQUALS', target)
  }
}

/** Whether the certificate is not expired (boolean). */
class CertNotExpiredAssertionBuilder {
  equals (target: boolean): SslAssertion {
    return toAssertion('CERT_NOT_EXPIRED', 'EQUALS', target)
  }
}

/** Whether the hostname is verified (boolean). */
class HostnameVerifiedAssertionBuilder {
  equals (target: boolean): SslAssertion {
    return toAssertion('HOSTNAME_VERIFIED', 'EQUALS', target)
  }
}

/** Whether the certificate chain is trusted (boolean). */
class ChainTrustedAssertionBuilder {
  equals (target: boolean): SslAssertion {
    return toAssertion('CHAIN_TRUSTED', 'EQUALS', target)
  }
}

/** Whether a stapled OCSP response was provided during the handshake (boolean). */
class OcspStapledAssertionBuilder {
  equals (target: boolean): SslAssertion {
    return toAssertion('OCSP_STAPLED', 'EQUALS', target)
  }
}

/** Negotiated TLS version — `.equals()` accepts only known TLS version strings. */
class TlsVersionAssertionBuilder {
  equals (target: TlsVersionValue): SslAssertion {
    return toAssertion('TLS_VERSION', 'EQUALS', target)
  }
}

/**
 * Certificate signature algorithm. `.equals()` takes a Go
 * `x509.Certificate.SignatureAlgorithm.String()` value; `.matches()` takes a regex.
 */
class SignatureAlgorithmAssertionBuilder {
  equals (target: SignatureAlgorithmValue): SslAssertion {
    return toAssertion('SIGNATURE_ALGORITHM', 'EQUALS', target)
  }

  matches (target: string): SslAssertion {
    return toAssertion('SIGNATURE_ALGORITHM', 'MATCHES', target)
  }
}

/** Negotiated cipher suite (string) — exact, not-equal, or regex match. */
class CipherSuiteAssertionBuilder {
  equals (target: string): SslAssertion {
    return toAssertion('CIPHER_SUITE', 'EQUALS', target)
  }

  notEquals (target: string): SslAssertion {
    return toAssertion('CIPHER_SUITE', 'NOT_EQUALS', target)
  }

  matches (target: string): SslAssertion {
    return toAssertion('CIPHER_SUITE', 'MATCHES', target)
  }
}

/** Certificate issuer common name (string) — exact, not-equal, or regex match. */
class IssuerCnAssertionBuilder {
  equals (target: string): SslAssertion {
    return toAssertion('ISSUER_CN', 'EQUALS', target)
  }

  notEquals (target: string): SslAssertion {
    return toAssertion('ISSUER_CN', 'NOT_EQUALS', target)
  }

  matches (target: string): SslAssertion {
    return toAssertion('ISSUER_CN', 'MATCHES', target)
  }
}

/** Certificate SHA-256 fingerprint (string, exact match only). */
class CertFingerprintSha256AssertionBuilder {
  equals (target: string): SslAssertion {
    return toAssertion('CERT_FINGERPRINT_SHA256', 'EQUALS', target)
  }
}

/** Issuer SHA-256 fingerprint (string, exact match only). */
class IssuerFingerprintSha256AssertionBuilder {
  equals (target: string): SslAssertion {
    return toAssertion('ISSUER_FINGERPRINT_SHA256', 'EQUALS', target)
  }
}

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
 * // Enforce a specific TLS version and key size
 * SslAssertionBuilder.tlsVersion().equals('TLS1.3')
 * SslAssertionBuilder.keySizeBits().equals(2048)
 *
 * // Match the issuer or cipher suite against a regex
 * SslAssertionBuilder.issuerCn().matches("^Let's Encrypt")
 * SslAssertionBuilder.cipherSuite().matches('TLS_(AES|CHACHA)')
 * ```
 */
export class SslAssertionBuilder {
  /** Assertion builder for the number of days until the certificate expires. */
  static certExpiresInDays () {
    return new CertExpiresInDaysAssertionBuilder()
  }

  /** Assertion builder for the certificate key size in bits. */
  static keySizeBits () {
    return new KeySizeBitsAssertionBuilder()
  }

  /** Assertion builder for whether the certificate is not expired. */
  static certNotExpired () {
    return new CertNotExpiredAssertionBuilder()
  }

  /** Assertion builder for whether the hostname is verified. */
  static hostnameVerified () {
    return new HostnameVerifiedAssertionBuilder()
  }

  /** Assertion builder for whether the certificate chain is trusted. */
  static chainTrusted () {
    return new ChainTrustedAssertionBuilder()
  }

  /**
   * Assertion builder for the negotiated TLS version. `.equals()` accepts only the
   * known TLS version strings — use the {@link TlsVersion} constants or the string
   * literals `'TLS1.0'`…`'TLS1.3'`.
   */
  static tlsVersion () {
    return new TlsVersionAssertionBuilder()
  }

  /**
   * Assertion builder for the negotiated cipher suite. Go's `tls.CipherSuiteName()`
   * can return hundreds of IANA names plus `0x....` hex fallbacks, so `.equals()` is
   * unconstrained; use the {@link CipherSuite} constants for common suites, or
   * `.matches()` with a regex pattern.
   */
  static cipherSuite () {
    return new CipherSuiteAssertionBuilder()
  }

  /** Assertion builder for the certificate issuer common name. */
  static issuerCn () {
    return new IssuerCnAssertionBuilder()
  }

  /** Assertion builder for the certificate SHA-256 fingerprint. */
  static certFingerprintSha256 () {
    return new CertFingerprintSha256AssertionBuilder()
  }

  /** Assertion builder for the issuer SHA-256 fingerprint. */
  static issuerFingerprintSha256 () {
    return new IssuerFingerprintSha256AssertionBuilder()
  }

  /**
   * Assertion builder for the certificate signature algorithm. `.equals()` takes a
   * Go `x509.Certificate.SignatureAlgorithm.String()` value (e.g. `'SHA256-RSA'`) —
   * use the {@link SignatureAlgorithm} constants — or `.matches()` with a regex.
   */
  static signatureAlgorithm () {
    return new SignatureAlgorithmAssertionBuilder()
  }

  /** Assertion builder for whether a stapled OCSP response was provided. */
  static ocspStapled () {
    return new OcspStapledAssertionBuilder()
  }
}
