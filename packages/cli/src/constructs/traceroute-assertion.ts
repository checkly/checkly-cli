import { Assertion as CoreAssertion, NumericAssertionBuilder } from './internal/assertion.js'

type TracerouteAssertionSource =
  | 'RESPONSE_TIME'
  | 'HOP_COUNT'
  | 'PACKET_LOSS'

export type TracerouteAssertion = CoreAssertion<TracerouteAssertionSource>

export type TracerouteResponseTimeProperty = 'avg' | 'min' | 'max' | 'stdDev'

/**
 * Builder class for creating traceroute monitor assertions.
 * Provides methods to create assertions for traceroute probe responses.
 *
 * @example
 * ```typescript
 * // Response time assertions
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
   * @param property The response time property to assert against:
   *   - `avg`: Average round-trip time in milliseconds
   *   - `min`: Minimum round-trip time in milliseconds
   *   - `max`: Maximum round-trip time in milliseconds
   *   - `stdDev`: Standard deviation of round-trip times
   * @returns A numeric assertion builder for the specified response time metric.
   */
  static responseTime (property: TracerouteResponseTimeProperty) {
    return new NumericAssertionBuilder<TracerouteAssertionSource, TracerouteResponseTimeProperty>(
      'RESPONSE_TIME',
      property,
    )
  }

  /**
   * Creates an assertion builder for the number of network hops.
   * @returns A numeric assertion builder for the hop count.
   */
  static hopCount () {
    return new NumericAssertionBuilder<TracerouteAssertionSource>('HOP_COUNT')
  }

  /**
   * Creates an assertion builder for the percentage of packet loss (0-100).
   * @returns A numeric assertion builder for packet loss.
   */
  static packetLoss () {
    return new NumericAssertionBuilder<TracerouteAssertionSource>('PACKET_LOSS')
  }
}
