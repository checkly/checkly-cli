import { Assertion as CoreAssertion } from './internal/assertion.js'
import { PropertyOperators, operatorsForProperty, operatorsForSource } from './internal/assertion-grammar.js'
import { hopCountGrammar, packetLossGrammar, tracerouteResponseTimeGrammar } from './traceroute-assertion-grammar.js'

type TracerouteAssertionSource =
  | 'RESPONSE_TIME'
  | 'HOP_COUNT'
  | 'PACKET_LOSS'

export type TracerouteAssertion = CoreAssertion<TracerouteAssertionSource>

// The response-time statistical properties, derived from the grammar table the builder is
// generated from, so the union and the per-property operators cannot drift.
export type TracerouteResponseTimeProperty = keyof typeof tracerouteResponseTimeGrammar

/**
 * Builder class for creating traceroute monitor assertions.
 * Provides methods to create assertions for traceroute probe responses.
 *
 * @example
 * ```typescript
 * // Response time assertions
 * TracerouteAssertionBuilder.responseTime().lessThan(1000)
 * TracerouteAssertionBuilder.responseTime('avg').lessThan(1000)
 * TracerouteAssertionBuilder.responseTime('max').lessThan(2000)
 * TracerouteAssertionBuilder.responseTime('stdDev').lessThan(50)
 *
 * // Hop count assertions
 * TracerouteAssertionBuilder.hopCount().lessThan(20)
 *
 * // Packet loss assertions (percentage, 0-100)
 * TracerouteAssertionBuilder.packetLoss().lessThan(10)
 * ```
 */
export class TracerouteAssertionBuilder {
  /**
   * Creates an assertion builder for traceroute response time metrics.
   * @param property The response time property to assert against. Defaults to `avg`.
   *   - `avg`: Average round-trip time in milliseconds
   *   - `min`: Minimum round-trip time in milliseconds
   *   - `max`: Maximum round-trip time in milliseconds
   *   - `stdDev`: Standard deviation of round-trip times
   * @returns A numeric assertion builder for the specified response time metric.
   */
  static responseTime<Property extends TracerouteResponseTimeProperty = 'avg'> (
    property: Property = 'avg' as Property,
  ): PropertyOperators<'RESPONSE_TIME', typeof tracerouteResponseTimeGrammar[Property]> {
    return operatorsForProperty(tracerouteResponseTimeGrammar, 'RESPONSE_TIME', property)
  }

  /**
   * Creates an assertion builder for the number of network hops.
   * @returns A numeric assertion builder for the hop count.
   */
  static hopCount (): PropertyOperators<'HOP_COUNT', typeof hopCountGrammar> {
    return operatorsForSource('HOP_COUNT', hopCountGrammar)
  }

  /**
   * Creates an assertion builder for the percentage of packet loss (0-100).
   * @returns A numeric assertion builder for packet loss.
   */
  static packetLoss (): PropertyOperators<'PACKET_LOSS', typeof packetLossGrammar> {
    return operatorsForSource('PACKET_LOSS', packetLossGrammar)
  }
}
