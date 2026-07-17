import {
  PropertyGrammar,
  TargetValueType,
  booleanTarget,
  comparisonsForGrammar,
  defineGrammar,
  numberTarget,
  stringTarget,
  valueTypeForGrammar,
} from './internal/assertion-grammar.js'
import type { SignatureAlgorithmValue, TlsVersionValue } from './ssl-assertion.js'

// The single declaration of the SSL certificate/connection assertion grammar. Each row is
// a property's entire contract — the operators it exposes and the type of its target. The
// public `SslAssertionBuilder`, its property unions, the validation whitelist, and codegen
// all derive from these two tables, so a property cannot gain an operator the whitelist
// rejects, or a target type codegen renders wrong, without editing this one row.

export const certificateGrammar = defineGrammar({
  /** Days until the certificate expires (numeric). */
  daysUntilExpiry: { operators: ['equals', 'notEquals', 'greaterThan', 'lessThan'], target: numberTarget() },
  /** Certificate key size in bits (numeric). */
  keySizeBits: { operators: ['equals', 'notEquals', 'greaterThan', 'lessThan'], target: numberTarget() },
  /** Certificate subject common name (free-form string). */
  subjectCN: { operators: ['equals', 'notEquals', 'contains', 'notContains'], target: stringTarget() },
  /** Certificate issuer common name (free-form string). */
  issuerCN: { operators: ['equals', 'notEquals', 'contains', 'notContains'], target: stringTarget() },
  /** Certificate serial number — an opaque identifier, compared whole. */
  serialNumber: { operators: ['equals', 'notEquals'], target: stringTarget() },
  /** Certificate SHA-256 fingerprint — an opaque identifier, compared whole. */
  fingerprintSha256: { operators: ['equals', 'notEquals'], target: stringTarget() },
  /** Issuer SHA-256 fingerprint — an opaque identifier, compared whole. */
  issuerFingerprintSha256: { operators: ['equals', 'notEquals'], target: stringTarget() },
  /** Certificate public key algorithm (e.g. `'RSA'`, `'ECDSA'`), compared whole. */
  keyAlgorithm: { operators: ['equals', 'notEquals'], target: stringTarget() },
  /** Certificate signature algorithm — a Go `x509 SignatureAlgorithm.String()` value. */
  signatureAlgorithm: { operators: ['equals', 'notEquals'], target: stringTarget<SignatureAlgorithmValue>() },
  /** Certificate subject alternative names. A list, so only membership can be asserted. */
  sans: { operators: ['contains', 'notContains'], target: stringTarget() },
  /** Whether the certificate is self-signed (boolean). */
  selfSigned: { operators: ['equals'], target: booleanTarget() },
  /** Whether the certificate is a CA certificate (boolean). */
  isCA: { operators: ['equals'], target: booleanTarget() },
})

export const connectionGrammar = defineGrammar({
  /** Negotiated TLS version. Ordered, so `greaterThan` expresses a minimum. */
  tlsVersion: { operators: ['equals', 'notEquals', 'greaterThan', 'lessThan'], target: stringTarget<TlsVersionValue>() },
  /** Negotiated cipher suite (free-form string; hundreds of IANA names). */
  cipherSuite: { operators: ['equals', 'notEquals', 'contains', 'notContains'], target: stringTarget() },
  /** Whether the hostname is verified against the certificate (boolean). */
  hostnameVerified: { operators: ['equals'], target: booleanTarget() },
  /** Whether the certificate chain is trusted (boolean). */
  chainTrusted: { operators: ['equals'], target: booleanTarget() },
  /** Whether a stapled OCSP response was provided during the handshake (boolean). */
  ocspStapled: { operators: ['equals'], target: booleanTarget() },
  /** OCSP revocation status (e.g. `'good'`, `'revoked'`), compared whole. */
  ocspStatus: { operators: ['equals', 'notEquals'], target: stringTarget() },
  /** The IP address the hostname resolved to (free-form string). */
  resolvedIp: { operators: ['equals', 'notEquals', 'contains', 'notContains'], target: stringTarget() },
})

const grammarBySource: Record<string, Record<string, PropertyGrammar>> = {
  CERTIFICATE: certificateGrammar,
  CONNECTION: connectionGrammar,
}

function propertyGrammar (source: string, property: string): PropertyGrammar | undefined {
  const grammar = Object.hasOwn(grammarBySource, source) ? grammarBySource[source] : undefined
  if (grammar === undefined || !Object.hasOwn(grammar, property)) {
    return undefined
  }
  return grammar[property]
}

/**
 * The wire comparisons each property of a source accepts, keyed by property name. Empty for
 * a source with no property-scoped grammar. Used by validation to reject an unsupported
 * comparison written as an object literal.
 */
export function sslComparisonsForSource (source: string): Record<string, Record<string, true>> {
  const grammar = Object.hasOwn(grammarBySource, source) ? grammarBySource[source] : {}
  return Object.fromEntries(
    Object.entries(grammar).map(([property, decl]) => [property, comparisonsForGrammar(decl)]),
  )
}

/**
 * How the target of a property-scoped SSL assertion is written, or `undefined` for a
 * property the backend does not define. Callers must handle the unknown case: object
 * literals bypass the builder's compile-time check and are reported by
 * `validateSslAssertion` instead.
 */
export function sslPropertyValueType (source: string, property: string): TargetValueType | undefined {
  const decl = propertyGrammar(source, property)
  return decl === undefined ? undefined : valueTypeForGrammar(decl)
}

/**
 * Whether a target is one this CLI treats as a number.
 *
 * Validation and codegen must agree: anything validation accepts, codegen has to render as
 * a bare numeric literal, because the property's operators take a `number` and a quoted
 * target would not compile. Targets are plain strings on the wire and reach here from object
 * literals and remote monitors, so this is a runtime predicate rather than a type.
 */
export function isSslNumericTarget (target: string): boolean {
  return target.trim() !== '' && Number.isFinite(Number(target))
}
