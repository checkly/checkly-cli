import { InvalidPropertyValueDiagnostic } from './construct-diagnostics.js'
import { Diagnostics } from './diagnostics.js'
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

function quotedKeys (values: Record<string, true>): string {
  return Object.keys(values).map(value => `"${value}"`).join(', ')
}

/**
 * Reports traceroute assertions whose source and property do not agree.
 *
 * Assertions written as plain object literals bypass TracerouteAssertionBuilder and
 * are type-legal, because `property` is declared as a plain string. The backend
 * rejects the invalid pairings with a 400, so they are caught here instead.
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
        diagnostics.add(new InvalidPropertyValueDiagnostic('request.assertions', new Error(
          `The RESPONSE_TIME assertion at "${location}" has an invalid property `
          + `${assertion.property === '' ? '(none)' : `"${assertion.property}"`}. `
          + `Expected one of ${quotedKeys(responseTimeProperties)}.`,
        )))
      }
      break
    case 'HOP_COUNT':
      // falls through
    case 'PACKET_LOSS':
      if (assertion.property) {
        diagnostics.add(new InvalidPropertyValueDiagnostic('request.assertions', new Error(
          `The ${assertion.source} assertion at "${location}" must not specify a property, `
          + `but got "${assertion.property}".`,
        )))
      }
      break
    default:
      diagnostics.add(new InvalidPropertyValueDiagnostic('request.assertions', new Error(
        `The assertion at "${location}" has an unknown source "${assertion.source}". `
        + `Expected one of ${quotedKeys(assertionSources)}.`,
      )))
      // Check files are loaded without type checking, so an unrecognized source reaches
      // this branch at runtime and is reported above. This additionally makes adding a
      // member to TracerouteAssertionSource without a matching case a compile-time error.
      assertion.source satisfies never
      break
  }
}
