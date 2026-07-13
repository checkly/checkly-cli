import { Diagnostics } from './diagnostics.js'
import { addAssertionDiagnostic, quotedKeys } from './internal/assertion-validation.js'
import { SslAssertion } from './ssl-assertion.js'

type SslSourceRule = {
  comparisons: Record<string, true>
  // Boolean sources compare against 'true'/'false' only; the runner rejects any
  // other target (go-runner ssl/executor.go). Target *values* are validated only for
  // boolean sources: booleans are a universal two-value set, so a typo is a pure
  // footgun. The larger closed sets (TLS_VERSION, SIGNATURE_ALGORITHM) are constrained
  // by the builder's value types instead; the deploy schema accepts any target string
  // (it is not a 400), so a hand-written out-of-set literal simply never matches at
  // evaluation, and re-validating those here would duplicate the value unions.
  booleanTarget?: boolean
}

// The operators the backend accepts per source (public-api schemas.js
// `sslMonitorAssertionComparisonsBySource`), minus the CLI-dropped
// GREATER_THAN_OR_EQUAL. Keyed by the source union so adding a source without a rule
// fails to compile.
const rules: Record<SslAssertion['source'], SslSourceRule> = {
  CERT_EXPIRES_IN_DAYS: { comparisons: { EQUALS: true, NOT_EQUALS: true, GREATER_THAN: true, LESS_THAN: true } },
  KEY_SIZE_BITS: { comparisons: { EQUALS: true } },
  CERT_NOT_EXPIRED: { comparisons: { EQUALS: true }, booleanTarget: true },
  HOSTNAME_VERIFIED: { comparisons: { EQUALS: true }, booleanTarget: true },
  CHAIN_TRUSTED: { comparisons: { EQUALS: true }, booleanTarget: true },
  OCSP_STAPLED: { comparisons: { EQUALS: true }, booleanTarget: true },
  TLS_VERSION: { comparisons: { EQUALS: true } },
  SIGNATURE_ALGORITHM: { comparisons: { EQUALS: true, MATCHES: true } },
  CIPHER_SUITE: { comparisons: { EQUALS: true, NOT_EQUALS: true, MATCHES: true } },
  ISSUER_CN: { comparisons: { EQUALS: true, NOT_EQUALS: true, MATCHES: true } },
  CERT_FINGERPRINT_SHA256: { comparisons: { EQUALS: true } },
  ISSUER_FINGERPRINT_SHA256: { comparisons: { EQUALS: true } },
}

/**
 * Reports SSL assertions whose source, comparison or boolean target the backend does
 * not accept.
 *
 * Assertions written as plain object literals bypass SslAssertionBuilder and are
 * type-legal, because the fields are declared as plain strings. The backend rejects
 * an unknown source or an operator not allowed for the source with a 400; a boolean
 * source with a non-`true`/`false` target is accepted at deploy but never matches at
 * evaluation, so it is reported too.
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

  if (!Object.hasOwn(rule.comparisons, assertion.comparison)) {
    addAssertionDiagnostic(diagnostics,
      `The ${assertion.source} assertion at "${location}" has an unsupported comparison `
      + `${assertion.comparison === '' ? '(none)' : `"${assertion.comparison}"`}. `
      + `Expected one of ${quotedKeys(rule.comparisons)}.`)
  }

  if (rule.booleanTarget && assertion.target !== 'true' && assertion.target !== 'false') {
    addAssertionDiagnostic(diagnostics,
      `The ${assertion.source} assertion at "${location}" must compare against "true" or "false", `
      + `but got "${assertion.target}".`)
  }
}
