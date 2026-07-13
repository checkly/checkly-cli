import { Diagnostics } from './diagnostics.js'
import { addAssertionDiagnostic, quotedKeys } from './internal/assertion-validation.js'
import { TracerouteAssertion, TracerouteResponseTimeProperty } from './traceroute-assertion.js'

// Runtime counterparts of unions that exist only at compile time. Typing them as a
// Record keyed by the union makes a missing or misspelled entry a compile-time error,
// so neither list can drift from the union it mirrors.
const responseTimeProperties: Record<TracerouteResponseTimeProperty, true> = {
  avg: true,
  min: true,
  max: true,
  stdDev: true,
}

const assertionSources: Record<TracerouteAssertion['source'], true> = {
  RESPONSE_TIME: true,
  HOP_COUNT: true,
  PACKET_LOSS: true,
}

// Comparisons the backend accepts per source. RESPONSE_TIME additionally permits
// NOT_EQUALS; hop count and packet loss do not. Keep in sync with the backend.
const responseTimeComparisons: Record<string, true> = {
  EQUALS: true,
  NOT_EQUALS: true,
  GREATER_THAN: true,
  LESS_THAN: true,
}

const numericComparisons: Record<string, true> = {
  EQUALS: true,
  GREATER_THAN: true,
  LESS_THAN: true,
}

/**
 * Reports traceroute assertions whose source, property or comparison the backend
 * does not accept.
 *
 * Assertions written as plain object literals bypass TracerouteAssertionBuilder and
 * are type-legal, because the fields are declared as plain strings. The backend
 * rejects the invalid combinations with a 400, so they are caught here instead.
 */
export function validateTracerouteAssertion (
  diagnostics: Diagnostics,
  assertion: TracerouteAssertion,
  index: number,
): void {
  const location = `request.assertions[${index}]`

  switch (assertion.source) {
    case 'RESPONSE_TIME':
      if (!Object.hasOwn(responseTimeProperties, assertion.property)) {
        addAssertionDiagnostic(diagnostics,
          `The RESPONSE_TIME assertion at "${location}" has an invalid property `
          + `${assertion.property === '' ? '(none)' : `"${assertion.property}"`}. `
          + `Expected one of ${quotedKeys(responseTimeProperties)}.`)
      }
      validateComparison(diagnostics, assertion, location, responseTimeComparisons)
      break
    case 'HOP_COUNT':
      // falls through
    case 'PACKET_LOSS':
      if (assertion.property) {
        addAssertionDiagnostic(diagnostics,
          `The ${assertion.source} assertion at "${location}" must not specify a property, `
          + `but got "${assertion.property}".`)
      }
      validateComparison(diagnostics, assertion, location, numericComparisons)
      break
    default:
      addAssertionDiagnostic(diagnostics,
        `The assertion at "${location}" has an unknown source "${assertion.source}". `
        + `Expected one of ${quotedKeys(assertionSources)}.`)
      // Check files are loaded without type checking, so an unrecognized source reaches
      // this branch at runtime and is reported above. This additionally makes adding a
      // member to TracerouteAssertionSource without a matching case a compile-time error.
      assertion.source satisfies never
      break
  }
}

// The comparison the backend accepts depends on the source, so the allowed set is
// passed in; an unknown source is reported separately and skips this check because
// no set applies to it.
function validateComparison (
  diagnostics: Diagnostics,
  assertion: TracerouteAssertion,
  location: string,
  allowed: Record<string, true>,
): void {
  if (!Object.hasOwn(allowed, assertion.comparison)) {
    addAssertionDiagnostic(diagnostics,
      `The ${assertion.source} assertion at "${location}" has an unsupported comparison `
      + `${assertion.comparison === '' ? '(none)' : `"${assertion.comparison}"`}. `
      + `Expected one of ${quotedKeys(allowed)}.`)
  }
}
