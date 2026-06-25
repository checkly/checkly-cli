import { Monitor, MonitorProps } from './monitor.js'
import { IPFamily } from './ip.js'
import { Session } from './session.js'
import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder } from './internal/assertion.js'
import { Diagnostics } from './diagnostics.js'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics.js'

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
 * Provides methods to assert on certificate, chain, TLS and handshake
 * properties of the inspected endpoint.
 *
 * @example
 * ```typescript
 * // Numeric assertions
 * SslAssertionBuilder.certExpiresInDays().greaterThan(7)
 * SslAssertionBuilder.keySizeBits().greaterThan(2047)
 * SslAssertionBuilder.handshakeTimeMs().lessThan(2000)
 *
 * // General assertions
 * SslAssertionBuilder.certNotExpired().equals(true)
 * SslAssertionBuilder.hostnameVerified().equals(true)
 * SslAssertionBuilder.tlsVersion().equals('TLS1.3')
 * SslAssertionBuilder.issuerCn().contains('Let\'s Encrypt')
 * SslAssertionBuilder.sanContains().equals('api.example.com')
 * ```
 */
export class SslAssertionBuilder {
  /**
   * Creates an assertion builder for the number of days until the certificate
   * expires.
   * @returns A numeric assertion builder for the remaining days
   */
  static certExpiresInDays () {
    return new NumericAssertionBuilder<SslAssertionSource>('CERT_EXPIRES_IN_DAYS')
  }

  /**
   * Creates an assertion builder for whether the certificate is currently
   * within its validity window.
   * @returns A general assertion builder for the not-expired flag
   */
  static certNotExpired () {
    return new GeneralAssertionBuilder<SslAssertionSource>('CERT_NOT_EXPIRED')
  }

  /**
   * Creates an assertion builder for whether the hostname matches the
   * certificate.
   * @returns A general assertion builder for the hostname-verified flag
   */
  static hostnameVerified () {
    return new GeneralAssertionBuilder<SslAssertionSource>('HOSTNAME_VERIFIED')
  }

  /**
   * Creates an assertion builder for whether the certificate chain is trusted.
   * @returns A general assertion builder for the chain-trusted flag
   */
  static chainTrusted () {
    return new GeneralAssertionBuilder<SslAssertionSource>('CHAIN_TRUSTED')
  }

  /**
   * Creates an assertion builder for the negotiated TLS version (e.g.
   * `'TLS1.2'` | `'TLS1.3'`).
   * @returns A general assertion builder for the TLS version
   */
  static tlsVersion () {
    return new GeneralAssertionBuilder<SslAssertionSource>('TLS_VERSION')
  }

  /**
   * Creates an assertion builder for the negotiated cipher suite.
   * @returns A general assertion builder for the cipher suite
   */
  static cipherSuite () {
    return new GeneralAssertionBuilder<SslAssertionSource>('CIPHER_SUITE')
  }

  /**
   * Creates an assertion builder for the certificate issuer common name.
   * @returns A general assertion builder for the issuer CN
   */
  static issuerCn () {
    return new GeneralAssertionBuilder<SslAssertionSource>('ISSUER_CN')
  }

  /**
   * Creates an assertion builder for the SHA-256 fingerprint of the leaf
   * certificate.
   * @returns A general assertion builder for the certificate fingerprint
   */
  static certFingerprintSha256 () {
    return new GeneralAssertionBuilder<SslAssertionSource>('CERT_FINGERPRINT_SHA256')
  }

  /**
   * Creates an assertion builder for the SHA-256 fingerprint of the issuer
   * certificate.
   * @returns A general assertion builder for the issuer fingerprint
   */
  static issuerFingerprintSha256 () {
    return new GeneralAssertionBuilder<SslAssertionSource>('ISSUER_FINGERPRINT_SHA256')
  }

  /**
   * Creates an assertion builder for the public key size in bits.
   * @returns A numeric assertion builder for the key size
   */
  static keySizeBits () {
    return new NumericAssertionBuilder<SslAssertionSource>('KEY_SIZE_BITS')
  }

  /**
   * Creates an assertion builder for the certificate signature algorithm.
   * @returns A general assertion builder for the signature algorithm
   */
  static signatureAlgorithm () {
    return new GeneralAssertionBuilder<SslAssertionSource>('SIGNATURE_ALGORITHM')
  }

  /**
   * Creates an assertion builder for whether an OCSP response was stapled.
   * @returns A general assertion builder for the OCSP-stapled flag
   */
  static ocspStapled () {
    return new GeneralAssertionBuilder<SslAssertionSource>('OCSP_STAPLED')
  }

  /**
   * Creates an assertion builder for the TLS handshake time in milliseconds.
   * @returns A numeric assertion builder for the handshake time
   */
  static handshakeTimeMs () {
    return new NumericAssertionBuilder<SslAssertionSource>('HANDSHAKE_TIME_MS')
  }

  /**
   * Creates an assertion builder for the subject alternative names (SAN) of the
   * certificate.
   * @returns A general assertion builder for the SAN entries
   */
  static sanContains () {
    return new GeneralAssertionBuilder<SslAssertionSource>('SAN_CONTAINS')
  }
}

/**
 * The severity applied when a security-baseline rule is violated.
 *
 * `fail` fails the check, `degrade` marks it degraded, `ignore` records the
 * finding without affecting the result.
 */
export type SslBaselineSeverity = 'fail' | 'degrade' | 'ignore'

/**
 * A security-baseline rule that only carries a severity (no configurable
 * threshold).
 */
export interface SslBaselineRule {
  /**
   * The severity applied when this rule is violated.
   */
  severity?: SslBaselineSeverity
}

/**
 * A security-baseline rule constrained to a minimum/recommended TLS version.
 */
export interface SslBaselineTLSVersionRule {
  /**
   * The TLS version the rule enforces or recommends.
   */
  value?: 'TLS1.2' | 'TLS1.3'

  /**
   * The severity applied when this rule is violated.
   */
  severity?: SslBaselineSeverity
}

/**
 * A security-baseline rule constrained to a minimum/recommended key size in
 * bits.
 */
export interface SslBaselineKeySizeRule {
  /**
   * The key size in bits the rule enforces or recommends.
   *
   * @minimum 1024
   * @maximum 16384
   */
  value?: number

  /**
   * The severity applied when this rule is violated.
   */
  severity?: SslBaselineSeverity
}

/**
 * The optional, server-defaulted SSL security baseline. Each rule is a flat
 * key carrying an optional `value` and/or `severity`; omit a rule (or the whole
 * baseline) to use the server defaults.
 */
export interface SslSecurityBaseline {
  /**
   * Whether the security baseline is evaluated.
   *
   * @defaultValue true
   */
  enabled?: boolean

  /**
   * Enforce a minimum negotiated TLS version.
   *
   * @defaultValue { value: 'TLS1.2', severity: 'fail' }
   */
  minTLSVersion?: SslBaselineTLSVersionRule

  /**
   * Enforce a minimum public key size.
   *
   * @defaultValue { value: 2048, severity: 'fail' }
   */
  minKeySizeBits?: SslBaselineKeySizeRule

  /**
   * Flag certificates signed with a weak signature algorithm.
   *
   * @defaultValue { severity: 'fail' }
   */
  weakSignatureAlgorithm?: SslBaselineRule

  /**
   * Flag connections negotiating a weak cipher suite.
   *
   * @defaultValue { severity: 'fail' }
   */
  weakCipherSuite?: SslBaselineRule

  /**
   * Flag certificates issued by a known-bad certificate authority.
   *
   * @defaultValue { severity: 'fail' }
   */
  knownBadCA?: SslBaselineRule

  /**
   * Recommend a preferred TLS version.
   *
   * @defaultValue { value: 'TLS1.3', severity: 'ignore' }
   */
  recommendedTLSVersion?: SslBaselineTLSVersionRule

  /**
   * Recommend a preferred public key size.
   *
   * @defaultValue { value: 3072, severity: 'ignore' }
   */
  recommendedKeySizeBits?: SslBaselineKeySizeRule

  /**
   * Recommend that OCSP Must-Staple is respected.
   *
   * @defaultValue { severity: 'ignore' }
   */
  ocspMustStapleRespected?: SslBaselineRule

  /**
   * Recommend that signed certificate timestamps (SCTs) are present.
   *
   * @defaultValue { severity: 'ignore' }
   */
  sctPresent?: SslBaselineRule
}

/**
 * The SSL-specific configuration nested inside an {@link SslRequest}, mirroring
 * the public API's `sslConfig`.
 */
export interface SslConfig {
  /**
   * The hostname whose TLS endpoint should be inspected.
   * Do not include a scheme or a port in the hostname.
   *
   * @example 'api.checklyhq.com'
   */
  hostname: string

  /**
   * The port to connect to.
   *
   * @minimum 1
   * @maximum 65535
   * @defaultValue 443
   */
  port?: number

  /**
   * The SNI server name to send, overriding {@link hostname}.
   */
  serverName?: string | null

  /**
   * The IP family to use for the connection.
   *
   * @defaultValue 'IPv4'
   */
  ipFamily?: IPFamily

  /**
   * Whether to skip certificate chain validation.
   *
   * @defaultValue false
   */
  skipChainValidation?: boolean

  /**
   * The TLS handshake timeout in milliseconds.
   *
   * @minimum 1000
   * @maximum 30000
   * @defaultValue 10000
   */
  handshakeTimeoutMs?: number

  /**
   * Raise an alert this many days before the certificate expires.
   *
   * @minimum 1
   * @maximum 365
   * @defaultValue 20
   */
  alertDaysBeforeExpiry?: number

  /**
   * The client certificate (mTLS) mode. `explicit` requires a matching
   * {@link SslRequest.sslClientCertificateId}.
   */
  clientCertificateMode?: 'auto' | 'explicit'

  /**
   * The handshake time in milliseconds above which the check is considered
   * degraded.
   *
   * @minimum 0
   * @maximum 30000
   * @defaultValue 3000
   */
  degradedResponseTimeMs?: number

  /**
   * The handshake time in milliseconds above which the check is considered
   * failing. Must be greater than or equal to {@link degradedResponseTimeMs}.
   *
   * @minimum 0
   * @maximum 30000
   * @defaultValue 10000
   */
  maxResponseTimeMs?: number

  /**
   * The optional security baseline. Omit to use the server defaults.
   */
  securityBaseline?: SslSecurityBaseline
}

/**
 * Configuration for the SSL check request.
 * Nests {@link SslConfig} like the public API.
 */
export interface SslRequest {
  /**
   * The SSL-specific configuration. Required by the public API.
   */
  sslConfig: SslConfig

  /**
   * The id of the client certificate to use for mTLS. Required when
   * `sslConfig.clientCertificateMode` is `'explicit'`.
   */
  sslClientCertificateId?: string | null

  /**
   * Assertions to validate the inspected certificate and TLS connection.
   * Check the main Checkly documentation on SSL assertions for specific values
   * that you can use in the "property" field.
   */
  assertions?: Array<SslAssertion>
}

export interface SslMonitorProps extends MonitorProps {
  /**
   * Determines the request that the check is going to run.
   */
  request: SslRequest
}

/**
 * Creates an SSL Monitor
 */
export class SslMonitor extends Monitor {
  request: SslRequest

  /**
   * Constructs the SSL Monitor instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/ssl-monitor/ Read more in the docs}
   */

  constructor (logicalId: string, props: SslMonitorProps) {
    super(logicalId, props)

    this.request = props.request

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `SslMonitor:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    // The SSL response-time thresholds live inside sslConfig; mirror the public
    // API's object-level `maxResponseTimeMs >= degradedResponseTimeMs` check so
    // an out-of-order pair fails locally instead of at create time.
    const { degradedResponseTimeMs, maxResponseTimeMs } = this.request.sslConfig
    if (
      degradedResponseTimeMs !== undefined
      && maxResponseTimeMs !== undefined
      && maxResponseTimeMs < degradedResponseTimeMs
    ) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'request.sslConfig.maxResponseTimeMs',
        new Error(
          `The value of "maxResponseTimeMs" must be greater than or equal to `
          + `"degradedResponseTimeMs".`
          + `\n\n`
          + `The current values are maxResponseTimeMs=${maxResponseTimeMs} and `
          + `degradedResponseTimeMs=${degradedResponseTimeMs}.`,
        ),
      ))
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'SSL',
      request: this.request,
    }
  }
}

// Aliases for backwards compatibility.
export {
  SslMonitorProps as SslCheckProps,
  SslMonitor as SslCheck,
}
