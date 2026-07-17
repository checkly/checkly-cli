import { Diagnostics } from './diagnostics.js'
import { addAssertionDiagnostic, quotedKeys } from './internal/assertion-validation.js'
import { TargetValueType } from './internal/assertion-grammar.js'
import { isSslNumericTarget, sslComparisonsForSource, sslPropertyValueType } from './ssl-assertion-grammar.js'
import { SslAssertion } from './ssl-assertion.js'

// The comparisons the backend accepts. The `>=` operator and the regex operator are both
// dropped for SSL, so neither appears in any set.
type Comparisons = Record<string, true>

const NUMBER: Comparisons = { EQUALS: true, NOT_EQUALS: true, GREATER_THAN: true, LESS_THAN: true }

// CERTIFICATE and CONNECTION are property-scoped: the allowed comparisons depend on the
// property, and an unknown property is itself an error. Their whitelists are derived from
// the grammar tables the builder is generated from (in internal/ssl-grammar.ts), so a
// property cannot expose an operator the whitelist rejects. RESPONSE_TIME, JSON_RESPONSE
// and TEXT_RESPONSE carry no whitelisted property (the property slot is a numeric
// placeholder / JSONPath / regex), so their comparisons are keyed by source.
type SslSourceRule =
  | { properties: Record<string, Comparisons> }
  | { comparisons: Comparisons, valueType?: TargetValueType }

// Keyed by the source union so adding a source without a rule fails to compile.
const rules: Record<SslAssertion['source'], SslSourceRule> = {
  CERTIFICATE: { properties: sslComparisonsForSource('CERTIFICATE') },
  CONNECTION: { properties: sslComparisonsForSource('CONNECTION') },
  RESPONSE_TIME: { comparisons: NUMBER, valueType: 'number' },
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

function isPropertyScoped (rule: SslSourceRule): rule is { properties: Record<string, Comparisons> } {
  return 'properties' in rule
}

function formatValue (value: string): string {
  return value === '' ? '(none)' : `"${value}"`
}

/**
 * Reports a target that is not of the value type its source or property expects.
 *
 * Target *values* are checked where the accepted set is universal — booleans are two
 * values, numbers are a total predicate — so a typo is a pure footgun the backend will not
 * catch: it accepts any target string at deploy and simply never matches at evaluation,
 * leaving an assertion that looks configured but silently never fires.
 *
 * The closed *enumerated* sets (tlsVersion, signatureAlgorithm) are deliberately not
 * checked: the builder's typed operators already constrain them, and restating their
 * members here would duplicate the value unions.
 */
function validateTargetValue (
  diagnostics: Diagnostics,
  assertion: SslAssertion,
  location: string,
  valueType: TargetValueType | undefined,
  subject: string,
): void {
  // `target` is declared a string, but object-literal assertions are not typechecked when
  // a check file is loaded, so a hand-written `target: 30` or an omitted target reaches
  // here as a non-string. Report it rather than dereferencing it — a TypeError out of
  // validate() would abort the command with no location or message.
  const target: unknown = assertion.target
  if (typeof target !== 'string') {
    if (valueType !== undefined) {
      addAssertionDiagnostic(diagnostics,
        `The ${subject} assertion at "${location}" must compare against a ${valueType} written as a string, `
        + `but got ${JSON.stringify(target) ?? String(target)}.`)
    }
    return
  }

  if (valueType === 'boolean' && target !== 'true' && target !== 'false') {
    addAssertionDiagnostic(diagnostics,
      `The ${subject} assertion at "${location}" must compare against "true" or "false", `
      + `but got "${target}".`)
  }

  if (valueType === 'number' && !isSslNumericTarget(target)) {
    addAssertionDiagnostic(diagnostics,
      `The ${subject} assertion at "${location}" must compare against a number, `
      + `but got ${formatValue(target)}.`)
  }
}

/**
 * Reports SSL assertions whose source, property, comparison or boolean target the
 * backend does not accept.
 *
 * Assertions written as plain object literals bypass SslAssertionBuilder and are
 * type-legal, because the fields are declared as plain strings. The backend rejects an
 * unknown source, an unknown property or an operator not allowed for the property with
 * a 400; a boolean or numeric property whose target is not of that type is accepted at
 * deploy but never matches at evaluation, so it is reported too.
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
    validateTargetValue(diagnostics, assertion, location, rule.valueType, assertion.source)
    return
  }

  const comparisons = Object.hasOwn(rule.properties, assertion.property)
    ? rule.properties[assertion.property]
    : undefined
  if (comparisons === undefined) {
    addAssertionDiagnostic(diagnostics,
      `The ${assertion.source} assertion at "${location}" has an unknown property `
      + `${formatValue(assertion.property)}. Expected one of ${quotedKeys(rule.properties)}.`)
    return
  }

  if (!Object.hasOwn(comparisons, assertion.comparison)) {
    addAssertionDiagnostic(diagnostics,
      `The ${assertion.source} "${assertion.property}" assertion at "${location}" has an unsupported comparison `
      + `${formatValue(assertion.comparison)}. Expected one of ${quotedKeys(comparisons)}.`)
  }

  validateTargetValue(
    diagnostics,
    assertion,
    location,
    sslPropertyValueType(assertion.source, assertion.property),
    `${assertion.source} "${assertion.property}"`,
  )
}
