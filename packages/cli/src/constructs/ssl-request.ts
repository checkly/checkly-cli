import { SslAssertion } from './ssl-assertion.js'
import { IPFamily } from './ip.js'

/**
 * The severity applied to an SSL security-baseline rule.
 *
 * - `fail` marks the monitor as failing when the rule is violated.
 * - `degrade` marks the monitor as degraded when the rule is violated.
 * - `ignore` disables the rule.
 */
export type SslBaselineSeverity = 'fail' | 'degrade' | 'ignore'

/**
 * A baseline rule whose value is a TLS version string (e.g. `TLS1.2`/`TLS1.3`).
 */
export interface SslBaselineTlsRule {
  value?: string
  severity?: SslBaselineSeverity
}

/**
 * A baseline rule whose value is a key size in bits.
 */
export interface SslBaselineKeySizeRule {
  value?: number
  severity?: SslBaselineSeverity
}

/**
 * A baseline rule that only carries a severity.
 */
export interface SslBaselineSeverityRule {
  severity?: SslBaselineSeverity
}

/**
 * The SSL security baseline — a set of enforceable and advisory rules. Provide
 * one only to override the server-side default baseline; omit it to inherit the
 * account default.
 */
export interface SecurityBaseline {
  /**
   * Whether the security baseline is enforced. The server defaults this to
   * `true` when omitted.
   */
  enabled?: boolean

  // Enforceable rules — server default severity "fail".
  minTLSVersion?: SslBaselineTlsRule
  minKeySizeBits?: SslBaselineKeySizeRule
  weakSignatureAlgorithm?: SslBaselineSeverityRule
  weakCipherSuite?: SslBaselineSeverityRule
  knownBadCA?: SslBaselineSeverityRule

  // Advisory rules — server default severity "ignore".
  recommendedTLSVersion?: SslBaselineTlsRule
  recommendedKeySizeBits?: SslBaselineKeySizeRule
  ocspMustStapleRespected?: SslBaselineSeverityRule
  sctPresent?: SslBaselineSeverityRule
}

/**
 * The mutual-TLS client-certificate mode.
 *
 * - `auto` lets Checkly select a stored certificate.
 * - `explicit` uses the certificate referenced by `sslClientCertificateId`.
 *
 * Omit to inherit the account default (no certificate sent).
 */
export type SslClientCertificateMode = 'auto' | 'explicit'

/**
 * SSL-specific configuration nested inside an SSL monitor's request.
 */
export interface SslConfig {
  /**
   * An optional SNI server name to send in the TLS handshake. Defaults to
   * `hostname` when unset.
   */
  serverName?: string

  /**
   * The ID of the stored client certificate to present. Required when
   * `clientCertificateMode` is `explicit`.
   */
  sslClientCertificateId?: string

  /**
   * When true, the certificate chain is not validated against trusted roots
   * (the certificate is still inspected for expiry and the security baseline).
   *
   * @defaultValue false
   */
  skipChainValidation?: boolean

  /**
   * The number of milliseconds to wait for the TLS handshake to complete before
   * timing out.
   *
   * @minimum 1000
   * @maximum 30000
   * @defaultValue 10000
   */
  handshakeTimeout?: number

  /**
   * Raise an alert when the certificate is within this many days of expiry.
   *
   * @minimum 1
   * @maximum 365
   * @defaultValue 20
   */
  alertDaysBeforeExpiry?: number

  /**
   * The mutual-TLS client-certificate mode. Omit to inherit the account default
   * (no certificate sent).
   */
  clientCertificateMode?: SslClientCertificateMode

  /**
   * The SSL security baseline. Omit to inherit the account default baseline.
   */
  securityBaseline?: SecurityBaseline
}

/**
 * Configuration for SSL requests.
 * Defines the connection parameters and validation rules.
 */
export interface SslRequest {
  /**
   * The hostname to connect to and validate the TLS certificate of. Do not
   * include a scheme or a port in this value.
   *
   * @example "example.com"
   */
  hostname: string

  /**
   * The port number to connect to.
   *
   * @minimum 1
   * @maximum 65535
   * @defaultValue 443
   */
  port?: number

  /**
   * The IP family to use when executing the check.
   *
   * @defaultValue "IPv4"
   */
  ipFamily?: IPFamily

  /**
   * The SSL-specific configuration for the connection.
   */
  sslConfig: SslConfig

  /**
   * Assertions to validate the TLS certificate.
   */
  assertions?: Array<SslAssertion>
}
