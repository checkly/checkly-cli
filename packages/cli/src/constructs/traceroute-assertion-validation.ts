import { Diagnostics } from './diagnostics.js'
import { comparisonsForGrammar } from './internal/assertion-grammar.js'
import { addAssertionDiagnostic, quotedKeys } from './internal/assertion-validation.js'
import { TracerouteAssertion } from './traceroute-assertion.js'
import {
  hopCountGrammar,
  packetLossGrammar,
  tracerouteResponseTimeComparisons,
} from './traceroute-assertion-grammar.js'

const assertionSources: Record<TracerouteAssertion['source'], true> = {
  RESPONSE_TIME: true,
  HOP_COUNT: true,
  PACKET_LOSS: true,
}

// Each source's comparison whitelist is derived from the grammar tables the builder is
// generated from, so validation cannot drift from what the builder produces. RESPONSE_TIME's
// per-property comparisons come from the grammar module; hop count and packet loss are
// single scalar sources (they omit notEquals), derived here.
const hopCountComparisons = comparisonsForGrammar(hopCountGrammar)
const packetLossComparisons = comparisonsForGrammar(packetLossGrammar)

// The comparisons accepted by any response-time property, for validating the comparison of
// an assertion whose property is itself invalid (so a bad comparison is still reported
// alongside the bad property).
const anyResponseTimeComparison: Record<string, true> =
  Object.assign({}, ...Object.values(tracerouteResponseTimeComparisons))

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
    case 'RESPONSE_TIME': {
      const propertyComparisons = Object.hasOwn(tracerouteResponseTimeComparisons, assertion.property)
        ? tracerouteResponseTimeComparisons[assertion.property]
        : undefined
      if (propertyComparisons === undefined) {
        addAssertionDiagnostic(diagnostics,
          `The RESPONSE_TIME assertion at "${location}" has an invalid property `
          + `${assertion.property === '' ? '(none)' : `"${assertion.property}"`}. `
          + `Expected one of ${quotedKeys(tracerouteResponseTimeComparisons)}.`)
      }
      validateComparison(diagnostics, assertion, location, propertyComparisons ?? anyResponseTimeComparison)
      break
    }
    case 'HOP_COUNT':
      // falls through
    case 'PACKET_LOSS':
      if (assertion.property) {
        addAssertionDiagnostic(diagnostics,
          `The ${assertion.source} assertion at "${location}" must not specify a property, `
          + `but got "${assertion.property}".`)
      }
      validateComparison(diagnostics, assertion, location,
        assertion.source === 'HOP_COUNT' ? hopCountComparisons : packetLossComparisons)
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
