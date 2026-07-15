import { Diagnostics } from './diagnostics.js'
import { GrpcAssertion, grpcHealthStatusTargetByLabel } from './grpc-assertion.js'
import { addAssertionDiagnostic, quotedKeys } from './internal/assertion-validation.js'

// The gRPC runner evaluates health-check status numerically (it parses `target`
// with `Atoi`), so the only valid wire targets are the numeric serving-status
// values. A label like "SERVING" — or garbage — sent as a raw target can never
// pass. The GrpcAssertionBuilder emits these numbers; object-literal users bypass it.
const grpcHealthStatusTargets: Record<string, true> = Object.fromEntries(
  Object.values(grpcHealthStatusTargetByLabel).map(target => [target, true]),
)

// Keyed by the source union so a member added to GrpcAssertion['source'] without a
// matching entry here is a compile-time error.
const assertionSources: Record<GrpcAssertion['source'], true> = {
  RESPONSE_TIME: true,
  GRPC_RESPONSE: true,
  TEXT_BODY: true,
  GRPC_METADATA: true,
  GRPC_HEALTHCHECK_STATUS: true,
  GRPC_STATUS_CODE: true,
}

// The comparisons the backend accepts for gRPC assertions. Unlike traceroute, the
// backend does not couple the comparison to the source — it is the shared
// 14-operator list. Keep in sync with the backend's accepted comparison set.
const assertionComparisons: Record<string, true> = {
  EQUALS: true,
  NOT_EQUALS: true,
  HAS_KEY: true,
  NOT_HAS_KEY: true,
  HAS_VALUE: true,
  NOT_HAS_VALUE: true,
  IS_EMPTY: true,
  NOT_EMPTY: true,
  GREATER_THAN: true,
  LESS_THAN: true,
  CONTAINS: true,
  NOT_CONTAINS: true,
  IS_NULL: true,
  NOT_NULL: true,
}

/**
 * Reports gRPC assertions whose source or comparison the backend does not accept.
 *
 * gRPC places no constraint on `property` — any string is valid for every source —
 * so only the source and comparison are checked. Assertions written as plain object
 * literals bypass GrpcAssertionBuilder and are type-legal because the fields are
 * declared as plain strings; the backend rejects an unknown source or comparison
 * with a 400. Source and comparison are independent (the accepted comparison does
 * not depend on the source), so both are always checked.
 */
export function validateGrpcAssertion (
  diagnostics: Diagnostics,
  assertion: GrpcAssertion,
  index: number,
): void {
  const location = `request.assertions[${index}]`

  if (!Object.hasOwn(assertionSources, assertion.source)) {
    addAssertionDiagnostic(diagnostics,
      `The assertion at "${location}" has an unknown source "${assertion.source}". `
      + `Expected one of ${quotedKeys(assertionSources)}.`)
  }

  if (!Object.hasOwn(assertionComparisons, assertion.comparison)) {
    addAssertionDiagnostic(diagnostics,
      `The assertion at "${location}" has an unsupported comparison `
      + `${assertion.comparison === '' ? '(none)' : `"${assertion.comparison}"`}. `
      + `Expected one of ${quotedKeys(assertionComparisons)}.`)
  }

  // The runner evaluates health-check status numerically, so a non-numeric target
  // (e.g. the label "SERVING", written directly on an object literal) can never
  // pass. Use GrpcAssertionBuilder.healthCheckStatus() to emit the numeric value.
  if (assertion.source === 'GRPC_HEALTHCHECK_STATUS'
    && !Object.hasOwn(grpcHealthStatusTargets, assertion.target)) {
    addAssertionDiagnostic(diagnostics,
      `The assertion at "${location}" has an invalid health-check status target `
      + `${assertion.target === '' ? '(none)' : `"${assertion.target}"`}. `
      + `Expected a numeric serving-status value: one of ${quotedKeys(grpcHealthStatusTargets)}. `
      + `Use GrpcAssertionBuilder.healthCheckStatus().equals('SERVING') to emit it from a label.`)
  }
}
