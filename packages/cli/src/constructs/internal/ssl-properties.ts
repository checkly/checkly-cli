import { SslCertificateProperty, SslConnectionProperty } from '../ssl-assertion.js'

/**
 * How a property's target value is written on the wire.
 *
 * `SslAssertionBuilder` already types each property's target through its operator class,
 * so this exists for the paths the builder does not cover: validation reports a boolean
 * property whose target is neither `true` nor `false`, and codegen decides whether to
 * emit a target as a bare literal or a quoted string. Assertions written as object
 * literals bypass the builder entirely, so both must work from data, not types.
 */
export type SslPropertyValueType = 'number' | 'boolean' | 'string'

// Keyed by the property unions, which are derived from the operator maps in
// ssl-assertion.ts — so a property cannot be added there without being classified here.
const certificatePropertyValueTypes: Record<SslCertificateProperty, SslPropertyValueType> = {
  daysUntilExpiry: 'number',
  keySizeBits: 'number',
  subjectCN: 'string',
  issuerCN: 'string',
  serialNumber: 'string',
  fingerprintSha256: 'string',
  issuerFingerprintSha256: 'string',
  keyAlgorithm: 'string',
  signatureAlgorithm: 'string',
  sans: 'string',
  selfSigned: 'boolean',
  isCA: 'boolean',
}

const connectionPropertyValueTypes: Record<SslConnectionProperty, SslPropertyValueType> = {
  tlsVersion: 'string',
  cipherSuite: 'string',
  hostnameVerified: 'boolean',
  chainTrusted: 'boolean',
  ocspStapled: 'boolean',
  ocspStatus: 'string',
  resolvedIp: 'string',
}

export const sslPropertyValueTypes: Record<string, Record<string, SslPropertyValueType>> = {
  CERTIFICATE: certificatePropertyValueTypes,
  CONNECTION: connectionPropertyValueTypes,
}

/**
 * Whether a target is one this CLI treats as a number.
 *
 * Validation and codegen must agree: anything validation accepts, codegen has to render
 * as a bare numeric literal, because the property's operators take a `number` and a quoted
 * target would not compile. Targets are plain strings on the wire and reach here from
 * object literals and remote monitors, so this is a runtime predicate rather than a type.
 */
export function isSslNumericTarget (target: string): boolean {
  return target.trim() !== '' && Number.isFinite(Number(target))
}

/**
 * How the target of a property-scoped SSL assertion is written, or `undefined` for a
 * property the backend does not define. Callers must handle the unknown case: object
 * literals bypass the builder's compile-time check and are reported by
 * `validateSslAssertion` instead.
 */
export function sslPropertyValueType (
  source: string,
  property: string,
): SslPropertyValueType | undefined {
  const properties = Object.hasOwn(sslPropertyValueTypes, source)
    ? sslPropertyValueTypes[source]
    : undefined
  if (properties === undefined || !Object.hasOwn(properties, property)) {
    return undefined
  }
  return properties[property]
}
