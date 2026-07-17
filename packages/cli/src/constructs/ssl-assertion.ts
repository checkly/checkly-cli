import {
  Assertion as CoreAssertion,
  GeneralAssertionBuilder,
  NumericAssertionBuilder,
  toAssertion,
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

// One operator class per property, each exposing exactly the comparisons the backend
// accepts for that property and typing its target accordingly. The classes are stateless
// — the source and property are baked into each `toAssertion` call — and are not
// exported: they are reachable only as the return type of an SslAssertionBuilder method,
// so they stay out of the package's public API, as the per-source builders they replace
// did.
//
// There is one class per property rather than one per value type. A property is the unit
// a user works in, so its grammar is worth stating outright; several classes coincide
// today, but each is free to follow its own property when the backend's grammar changes.

/** Days until the certificate expires (numeric). */
class SslDaysUntilExpiryOperators {
  equals (target: number): SslAssertion {
    return toAssertion('CERTIFICATE', 'EQUALS', target, 'daysUntilExpiry')
  }

  notEquals (target: number): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_EQUALS', target, 'daysUntilExpiry')
  }

  greaterThan (target: number): SslAssertion {
    return toAssertion('CERTIFICATE', 'GREATER_THAN', target, 'daysUntilExpiry')
  }

  lessThan (target: number): SslAssertion {
    return toAssertion('CERTIFICATE', 'LESS_THAN', target, 'daysUntilExpiry')
  }
}

/** Certificate key size in bits (numeric). */
class SslKeySizeBitsOperators {
  equals (target: number): SslAssertion {
    return toAssertion('CERTIFICATE', 'EQUALS', target, 'keySizeBits')
  }

  notEquals (target: number): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_EQUALS', target, 'keySizeBits')
  }

  greaterThan (target: number): SslAssertion {
    return toAssertion('CERTIFICATE', 'GREATER_THAN', target, 'keySizeBits')
  }

  lessThan (target: number): SslAssertion {
    return toAssertion('CERTIFICATE', 'LESS_THAN', target, 'keySizeBits')
  }
}

/** Certificate subject common name (free-form string). */
class SslSubjectCNOperators {
  equals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'EQUALS', target, 'subjectCN')
  }

  notEquals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_EQUALS', target, 'subjectCN')
  }

  contains (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'CONTAINS', target, 'subjectCN')
  }

  notContains (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_CONTAINS', target, 'subjectCN')
  }
}

/** Certificate issuer common name (free-form string). */
class SslIssuerCNOperators {
  equals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'EQUALS', target, 'issuerCN')
  }

  notEquals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_EQUALS', target, 'issuerCN')
  }

  contains (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'CONTAINS', target, 'issuerCN')
  }

  notContains (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_CONTAINS', target, 'issuerCN')
  }
}

/** Certificate serial number — an opaque identifier, compared whole. */
class SslSerialNumberOperators {
  equals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'EQUALS', target, 'serialNumber')
  }

  notEquals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_EQUALS', target, 'serialNumber')
  }
}

/** Certificate SHA-256 fingerprint — an opaque identifier, compared whole. */
class SslFingerprintSha256Operators {
  equals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'EQUALS', target, 'fingerprintSha256')
  }

  notEquals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_EQUALS', target, 'fingerprintSha256')
  }
}

/** Issuer SHA-256 fingerprint — an opaque identifier, compared whole. */
class SslIssuerFingerprintSha256Operators {
  equals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'EQUALS', target, 'issuerFingerprintSha256')
  }

  notEquals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_EQUALS', target, 'issuerFingerprintSha256')
  }
}

/** Certificate public key algorithm (e.g. `'RSA'`, `'ECDSA'`), compared whole. */
class SslKeyAlgorithmOperators {
  equals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'EQUALS', target, 'keyAlgorithm')
  }

  notEquals (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_EQUALS', target, 'keyAlgorithm')
  }
}

/**
 * Certificate signature algorithm. Takes a Go
 * `x509.Certificate.SignatureAlgorithm.String()` value — use the
 * {@link SignatureAlgorithm} constants.
 */
class SslSignatureAlgorithmOperators {
  equals (target: SignatureAlgorithmValue): SslAssertion {
    return toAssertion('CERTIFICATE', 'EQUALS', target, 'signatureAlgorithm')
  }

  notEquals (target: SignatureAlgorithmValue): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_EQUALS', target, 'signatureAlgorithm')
  }
}

/**
 * Certificate subject alternative names. A list, so only membership can be asserted —
 * there is no whole-list value to compare against.
 */
class SslSansOperators {
  contains (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'CONTAINS', target, 'sans')
  }

  notContains (target: string): SslAssertion {
    return toAssertion('CERTIFICATE', 'NOT_CONTAINS', target, 'sans')
  }
}

/** Whether the certificate is self-signed (boolean). */
class SslSelfSignedOperators {
  equals (target: boolean): SslAssertion {
    return toAssertion('CERTIFICATE', 'EQUALS', target, 'selfSigned')
  }
}

/** Whether the certificate is a CA certificate (boolean). */
class SslIsCAOperators {
  equals (target: boolean): SslAssertion {
    return toAssertion('CERTIFICATE', 'EQUALS', target, 'isCA')
  }
}

/**
 * Negotiated TLS version. Ordered, so `greaterThan` expresses a minimum — use the
 * {@link TlsVersion} constants.
 */
class SslTlsVersionOperators {
  equals (target: TlsVersionValue): SslAssertion {
    return toAssertion('CONNECTION', 'EQUALS', target, 'tlsVersion')
  }

  notEquals (target: TlsVersionValue): SslAssertion {
    return toAssertion('CONNECTION', 'NOT_EQUALS', target, 'tlsVersion')
  }

  greaterThan (target: TlsVersionValue): SslAssertion {
    return toAssertion('CONNECTION', 'GREATER_THAN', target, 'tlsVersion')
  }

  lessThan (target: TlsVersionValue): SslAssertion {
    return toAssertion('CONNECTION', 'LESS_THAN', target, 'tlsVersion')
  }
}

/**
 * Negotiated cipher suite. Go's `tls.CipherSuiteName()` can return hundreds of IANA
 * names plus `0x....` hex fallbacks, so the target is unconstrained; use the
 * {@link CipherSuite} constants for common suites.
 */
class SslCipherSuiteOperators {
  equals (target: string): SslAssertion {
    return toAssertion('CONNECTION', 'EQUALS', target, 'cipherSuite')
  }

  notEquals (target: string): SslAssertion {
    return toAssertion('CONNECTION', 'NOT_EQUALS', target, 'cipherSuite')
  }

  contains (target: string): SslAssertion {
    return toAssertion('CONNECTION', 'CONTAINS', target, 'cipherSuite')
  }

  notContains (target: string): SslAssertion {
    return toAssertion('CONNECTION', 'NOT_CONTAINS', target, 'cipherSuite')
  }
}

/** Whether the hostname is verified against the certificate (boolean). */
class SslHostnameVerifiedOperators {
  equals (target: boolean): SslAssertion {
    return toAssertion('CONNECTION', 'EQUALS', target, 'hostnameVerified')
  }
}

/** Whether the certificate chain is trusted (boolean). */
class SslChainTrustedOperators {
  equals (target: boolean): SslAssertion {
    return toAssertion('CONNECTION', 'EQUALS', target, 'chainTrusted')
  }
}

/** Whether a stapled OCSP response was provided during the handshake (boolean). */
class SslOcspStapledOperators {
  equals (target: boolean): SslAssertion {
    return toAssertion('CONNECTION', 'EQUALS', target, 'ocspStapled')
  }
}

/** OCSP revocation status (e.g. `'good'`, `'revoked'`), compared whole. */
class SslOcspStatusOperators {
  equals (target: string): SslAssertion {
    return toAssertion('CONNECTION', 'EQUALS', target, 'ocspStatus')
  }

  notEquals (target: string): SslAssertion {
    return toAssertion('CONNECTION', 'NOT_EQUALS', target, 'ocspStatus')
  }
}

/** The IP address the hostname resolved to (free-form string). */
class SslResolvedIpOperators {
  equals (target: string): SslAssertion {
    return toAssertion('CONNECTION', 'EQUALS', target, 'resolvedIp')
  }

  notEquals (target: string): SslAssertion {
    return toAssertion('CONNECTION', 'NOT_EQUALS', target, 'resolvedIp')
  }

  contains (target: string): SslAssertion {
    return toAssertion('CONNECTION', 'CONTAINS', target, 'resolvedIp')
  }

  notContains (target: string): SslAssertion {
    return toAssertion('CONNECTION', 'NOT_CONTAINS', target, 'resolvedIp')
  }
}

// Maps each property to its operator class. This is the single place a property is
// declared: the property unions and the builder return types are both derived from it, so
// a property cannot exist without operators, or gain operators it does not expose.
const certificateOperators = {
  daysUntilExpiry: SslDaysUntilExpiryOperators,
  keySizeBits: SslKeySizeBitsOperators,
  subjectCN: SslSubjectCNOperators,
  issuerCN: SslIssuerCNOperators,
  serialNumber: SslSerialNumberOperators,
  fingerprintSha256: SslFingerprintSha256Operators,
  issuerFingerprintSha256: SslIssuerFingerprintSha256Operators,
  keyAlgorithm: SslKeyAlgorithmOperators,
  signatureAlgorithm: SslSignatureAlgorithmOperators,
  sans: SslSansOperators,
  selfSigned: SslSelfSignedOperators,
  isCA: SslIsCAOperators,
} as const

const connectionOperators = {
  tlsVersion: SslTlsVersionOperators,
  cipherSuite: SslCipherSuiteOperators,
  hostnameVerified: SslHostnameVerifiedOperators,
  chainTrusted: SslChainTrustedOperators,
  ocspStapled: SslOcspStapledOperators,
  ocspStatus: SslOcspStatusOperators,
  resolvedIp: SslResolvedIpOperators,
} as const

/** The certificate properties an assertion can be made against. */
export type SslCertificateProperty = keyof typeof certificateOperators

/** The connection properties an assertion can be made against. */
export type SslConnectionProperty = keyof typeof connectionOperators

/**
 * Instantiates the operators for a property.
 *
 * The typed signatures make an unknown property a compile error, but plain JavaScript
 * callers and object-literal assertions still reach this at runtime. Those fall back to
 * the unconstrained operator set, so the call returns something usable and the property is
 * reported by `validateSslAssertion` at deploy time rather than throwing here.
 *
 * The cast is unavoidable: the return type is computed from the property's literal type,
 * which the runtime lookup cannot express. It is sound because the operator maps are keyed
 * by the same properties as the unions derived from them.
 */
function operatorsForProperty<Operators extends Record<string, new () => unknown>, Property extends keyof Operators> (
  operators: Operators,
  source: SslAssertionSource,
  property: Property,
): InstanceType<Operators[Property]> {
  if (!Object.hasOwn(operators, property)) {
    return new GeneralAssertionBuilder<SslAssertionSource>(
      source, String(property),
    ) as InstanceType<Operators[Property]>
  }
  return new operators[property]() as InstanceType<Operators[Property]>
}

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
  static certificate<Property extends SslCertificateProperty> (
    property: Property,
  ): InstanceType<typeof certificateOperators[Property]> {
    return operatorsForProperty(certificateOperators, 'CERTIFICATE', property)
  }

  /**
   * Creates an assertion builder for a connection property.
   * @param property The connection property to assert on (e.g. `'tlsVersion'`,
   *   `'cipherSuite'`, `'hostnameVerified'`, `'ocspStatus'`, `'resolvedIp'`).
   */
  static connection<Property extends SslConnectionProperty> (
    property: Property,
  ): InstanceType<typeof connectionOperators[Property]> {
    return operatorsForProperty(connectionOperators, 'CONNECTION', property)
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
   * @param regex Optional regex pattern (with a capture group) used to extract the value
   *   to compare from the serialized response document. Carried in the assertion's
   *   `property` field — the slot the backend and runner read the pattern from.
   */
  static textResponse (regex?: string) {
    return new GeneralAssertionBuilder<SslAssertionSource>('TEXT_RESPONSE', regex)
  }
}
