import { PropertyGrammar, comparisonsForGrammar, defineGrammar, numberTarget } from './internal/assertion-grammar.js'

// The single declaration of the traceroute assertion grammar. RESPONSE_TIME is
// property-scoped over statistical properties, each taking the full numeric operator set.
// HOP_COUNT and PACKET_LOSS are single scalar sources whose backend grammar omits
// notEquals, so they exist as their own one-off declarations. The builder, its property
// union, and the validation whitelist all derive from these tables.

export const tracerouteResponseTimeGrammar = defineGrammar({
  /** Average round-trip time in milliseconds. */
  avg: { operators: ['equals', 'notEquals', 'greaterThan', 'lessThan'], target: numberTarget() },
  /** Minimum round-trip time in milliseconds. */
  min: { operators: ['equals', 'notEquals', 'greaterThan', 'lessThan'], target: numberTarget() },
  /** Maximum round-trip time in milliseconds. */
  max: { operators: ['equals', 'notEquals', 'greaterThan', 'lessThan'], target: numberTarget() },
  /** Standard deviation of round-trip times. */
  stdDev: { operators: ['equals', 'notEquals', 'greaterThan', 'lessThan'], target: numberTarget() },
})

/** Number of network hops. The backend omits notEquals. */
export const hopCountGrammar = {
  operators: ['equals', 'greaterThan', 'lessThan'],
  target: numberTarget(),
} as const satisfies PropertyGrammar

/** Packet loss percentage (0-100). The backend omits notEquals. */
export const packetLossGrammar = {
  operators: ['equals', 'greaterThan', 'lessThan'],
  target: numberTarget(),
} as const satisfies PropertyGrammar

// The wire comparisons each response-time property accepts, keyed by property. Derived here,
// beside the grammar (as SSL keeps its comparison derivation), so validation is a thin
// consumer and the two monitors resolve the same concept in the same place. Per-property
// rather than one shared set, so a property that later diverges is validated against its own
// row.
export const tracerouteResponseTimeComparisons: Record<string, Record<string, true>> =
  Object.fromEntries(
    Object.entries(tracerouteResponseTimeGrammar).map(([property, decl]) => [property, comparisonsForGrammar(decl)]),
  )
