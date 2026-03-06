import { Assertion as CoreAssertion, NumericAssertionBuilder } from './internal/assertion'

type TracerouteAssertionSource =
  | 'RESPONSE_TIME'
  | 'HOP_COUNT'
  | 'PACKET_LOSS'

export type TracerouteAssertion = CoreAssertion<TracerouteAssertionSource>

export type TracerouteResponseTimeProperty = 'avg' | 'min' | 'max' | 'stdDev'

/**
 * Builder class for creating Traceroute monitor assertions.
 * Provides methods to create assertions for traceroute responses.
 *
 * @example
 * ```typescript
 * // Response time assertions
 * TracerouteAssertionBuilder.responseTime('avg').lessThan(100)
 * TracerouteAssertionBuilder.responseTime('max').lessThan(200)
 *
 * // Hop count assertions
 * TracerouteAssertionBuilder.hopCount().lessThan(15)
 *
 * // Packet loss assertions
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
    return new NumericAssertionBuilder<TracerouteAssertionSource, TracerouteResponseTimeProperty>('RESPONSE_TIME', property)
  }

  /**
   * Creates an assertion builder for the total hop count.
   * @returns A numeric assertion builder for the hop count.
   */
  static hopCount () {
    return new NumericAssertionBuilder<TracerouteAssertionSource>('HOP_COUNT')
  }

  /**
   * Creates an assertion builder for packet loss percentage.
   * @returns A numeric assertion builder for the packet loss percentage.
   */
  static packetLoss () {
    return new NumericAssertionBuilder<TracerouteAssertionSource>('PACKET_LOSS')
  }
}
