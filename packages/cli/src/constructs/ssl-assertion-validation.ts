import { Diagnostics } from './diagnostics.js'
import { addAssertionDiagnostic, quotedKeys } from './internal/assertion-validation.js'
import { SslAssertion, SslCertificateProperty, SslConnectionProperty } from './ssl-assertion.js'

// The comparisons the backend accepts per value type. The `>=` operator and the regex
// operator are both dropped for SSL, so neither appears in any set.
type Comparisons = Record<string, true>

const NUMBER: Comparisons = { EQUALS: true, NOT_EQUALS: true, GREATER_THAN: true, LESS_THAN: true }
const VERSION: Comparisons = { EQUALS: true, NOT_EQUALS: true, GREATER_THAN: true, LESS_THAN: true }
const STRING: Comparisons = { EQUALS: true, NOT_EQUALS: true, CONTAINS: true, NOT_CONTAINS: true }
const ID: Comparisons = { EQUALS: true, NOT_EQUALS: true }
const ENUM: Comparisons = { EQUALS: true, NOT_EQUALS: true }
const STRING_LIST: Comparisons = { CONTAINS: true, NOT_CONTAINS: true }
const BOOLEAN: Comparisons = { EQUALS: true }

type PropertyRule = {
  comparisons: Comparisons
  // Boolean properties compare against 'true'/'false' only; the backend evaluates any
  // other target as a permanent non-match. Target *values* are validated only for
  // boolean properties: booleans are a universal two-value set, so a typo is a pure
  // footgun. The larger closed sets (tlsVersion, signatureAlgorithm) are constrained by
  // documented constant maps instead; the backend accepts any target string (it is not
  // rejected at deploy), so a hand-written out-of-set literal simply never matches at
  // evaluation, and re-validating those here would duplicate the value unions.
  booleanTarget?: boolean
}

// CERTIFICATE and CONNECTION are property-scoped: the allowed comparisons depend on the
// property's value type, and an unknown property is itself an error. RESPONSE_TIME,
// JSON_RESPONSE and TEXT_RESPONSE carry no whitelisted property (the property slot is a
// numeric placeholder / JSONPath / regex), so their comparisons are keyed by source.
type SslSourceRule =
  | { properties: Record<string, PropertyRule> }
  | { comparisons: Comparisons }

// Runtime counterparts of unions that exist only at compile time. Typing them as a
// Record keyed by the union makes a missing or misspelled entry a compile-time error,
// so neither list can drift from the union it mirrors.
const certificateProperties: Record<SslCertificateProperty, PropertyRule> = {
  daysUntilExpiry: { comparisons: NUMBER },
  keySizeBits: { comparisons: NUMBER },
  subjectCN: { comparisons: STRING },
  issuerCN: { comparisons: STRING },
  serialNumber: { comparisons: ID },
  fingerprintSha256: { comparisons: ID },
  issuerFingerprintSha256: { comparisons: ID },
  keyAlgorithm: { comparisons: ID },
  signatureAlgorithm: { comparisons: ENUM },
  sans: { comparisons: STRING_LIST },
  selfSigned: { comparisons: BOOLEAN, booleanTarget: true },
  isCA: { comparisons: BOOLEAN, booleanTarget: true },
}

const connectionProperties: Record<SslConnectionProperty, PropertyRule> = {
  tlsVersion: { comparisons: VERSION },
  cipherSuite: { comparisons: STRING },
  hostnameVerified: { comparisons: BOOLEAN, booleanTarget: true },
  chainTrusted: { comparisons: BOOLEAN, booleanTarget: true },
  ocspStapled: { comparisons: BOOLEAN, booleanTarget: true },
  ocspStatus: { comparisons: ENUM },
  resolvedIp: { comparisons: STRING },
}

// Keyed by the source union so adding a source without a rule fails to compile.
const rules: Record<SslAssertion['source'], SslSourceRule> = {
  CERTIFICATE: { properties: certificateProperties },
  CONNECTION: { properties: connectionProperties },
  RESPONSE_TIME: { comparisons: NUMBER },
  JSON_RESPONSE: {
    comparisons: {
      EQUALS: true,
      NOT_EQUALS: true,
      IS_EMPTY: true,
      NOT_EMPTY: true,
      GREATER_THAN: true,
      LESS_THAN: true,
      CONTAINS: true,
      NOT_CONTAINS: true,
      IS_NULL: true,
      NOT_NULL: true,
    },
  },
  TEXT_RESPONSE: {
    comparisons: {
      EQUALS: true,
      NOT_EQUALS: true,
      IS_EMPTY: true,
      NOT_EMPTY: true,
      CONTAINS: true,
      NOT_CONTAINS: true,
      GREATER_THAN: true,
      LESS_THAN: true,
    },
  },
}

function isPropertyScoped (rule: SslSourceRule): rule is { properties: Record<string, PropertyRule> } {
  return 'properties' in rule
}

function formatValue (value: string): string {
  return value === '' ? '(none)' : `"${value}"`
}

/**
 * Reports SSL assertions whose source, property, comparison or boolean target the
 * backend does not accept.
 *
 * Assertions written as plain object literals bypass SslAssertionBuilder and are
 * type-legal, because the fields are declared as plain strings. The backend rejects an
 * unknown source, an unknown property or an operator not allowed for the property with
 * a 400; a boolean property with a non-`true`/`false` target is accepted at deploy but
 * never matches at evaluation, so it is reported too.
 */
export function validateSslAssertion (
  diagnostics: Diagnostics,
  assertion: SslAssertion,
  index: number,
): void {
  const location = `request.assertions[${index}]`

  const rule = Object.hasOwn(rules, assertion.source)
    ? rules[assertion.source as SslAssertion['source']]
    : undefined
  if (rule === undefined) {
    addAssertionDiagnostic(diagnostics,
      `The assertion at "${location}" has an unknown source "${assertion.source}". `
      + `Expected one of ${quotedKeys(rules)}.`)
    return
  }

  if (!isPropertyScoped(rule)) {
    if (!Object.hasOwn(rule.comparisons, assertion.comparison)) {
      addAssertionDiagnostic(diagnostics,
        `The ${assertion.source} assertion at "${location}" has an unsupported comparison `
        + `${formatValue(assertion.comparison)}. Expected one of ${quotedKeys(rule.comparisons)}.`)
    }
    return
  }

  const propertyRule = Object.hasOwn(rule.properties, assertion.property)
    ? rule.properties[assertion.property]
    : undefined
  if (propertyRule === undefined) {
    addAssertionDiagnostic(diagnostics,
      `The ${assertion.source} assertion at "${location}" has an unknown property `
      + `${formatValue(assertion.property)}. Expected one of ${quotedKeys(rule.properties)}.`)
    return
  }

  if (!Object.hasOwn(propertyRule.comparisons, assertion.comparison)) {
    addAssertionDiagnostic(diagnostics,
      `The ${assertion.source} "${assertion.property}" assertion at "${location}" has an unsupported comparison `
      + `${formatValue(assertion.comparison)}. Expected one of ${quotedKeys(propertyRule.comparisons)}.`)
  }

  if (propertyRule.booleanTarget && assertion.target !== 'true' && assertion.target !== 'false') {
    addAssertionDiagnostic(diagnostics,
      `The ${assertion.source} "${assertion.property}" assertion at "${location}" must compare against "true" or "false", `
      + `but got "${assertion.target}".`)
  }
}
