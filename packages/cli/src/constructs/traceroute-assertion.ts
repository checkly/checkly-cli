import { Assertion as CoreAssertion, toAssertion } from './internal/assertion.js'

type TracerouteAssertionSource =
  | 'RESPONSE_TIME'
  | 'HOP_COUNT'
  | 'PACKET_LOSS'

export type TracerouteAssertion = CoreAssertion<TracerouteAssertionSource>

export type TracerouteResponseTimeProperty = 'avg' | 'min' | 'max' | 'stdDev'

// One builder class per source, each exposing only the operators the backend accepts
// for that source. The classes are stateless — the source (and, for response time, the
// statistical property) is baked into each `toAssertion` call — and are not exported:
// they are reachable only through `TracerouteAssertionBuilder`.

/** Response time for a statistical property — accepts the full numeric operator set. */
class ResponseTimeAssertionBuilder {
  constructor (private property: TracerouteResponseTimeProperty) {}
  equals (target: number): TracerouteAssertion { return toAssertion('RESPONSE_TIME', 'EQUALS', target, this.property) }
  notEquals (target: number): TracerouteAssertion {
    return toAssertion('RESPONSE_TIME', 'NOT_EQUALS', target, this.property)
  }
  lessThan (target: number): TracerouteAssertion { return toAssertion('RESPONSE_TIME', 'LESS_THAN', target, this.property) }
  greaterThan (target: number): TracerouteAssertion {
    return toAssertion('RESPONSE_TIME', 'GREATER_THAN', target, this.property)
  }
}

/** Number of network hops — accepts EQUALS / LESS_THAN / GREATER_THAN (not NOT_EQUALS). */
class HopCountAssertionBuilder {
  equals (target: number): TracerouteAssertion { return toAssertion('HOP_COUNT', 'EQUALS', target) }
  lessThan (target: number): TracerouteAssertion { return toAssertion('HOP_COUNT', 'LESS_THAN', target) }
  greaterThan (target: number): TracerouteAssertion { return toAssertion('HOP_COUNT', 'GREATER_THAN', target) }
}

/** Packet loss percentage (0-100) — accepts EQUALS / LESS_THAN / GREATER_THAN (not NOT_EQUALS). */
class PacketLossAssertionBuilder {
  equals (target: number): TracerouteAssertion { return toAssertion('PACKET_LOSS', 'EQUALS', target) }
  lessThan (target: number): TracerouteAssertion { return toAssertion('PACKET_LOSS', 'LESS_THAN', target) }
  greaterThan (target: number): TracerouteAssertion { return toAssertion('PACKET_LOSS', 'GREATER_THAN', target) }
}

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
  static responseTime (property: TracerouteResponseTimeProperty = 'avg') {
    return new ResponseTimeAssertionBuilder(property)
  }

  /**
   * Creates an assertion builder for the number of network hops.
   * @returns A numeric assertion builder for the hop count.
   */
  static hopCount () {
    return new HopCountAssertionBuilder()
  }

  /**
   * Creates an assertion builder for the percentage of packet loss (0-100).
   * @returns A numeric assertion builder for packet loss.
   */
  static packetLoss () {
    return new PacketLossAssertionBuilder()
  }
}
