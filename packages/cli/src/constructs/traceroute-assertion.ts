import { Assertion as CoreAssertion, NumericAssertionBuilder } from './internal/assertion.js'

type TracerouteAssertionSource =
  | 'RESPONSE_TIME'
  | 'HOP_COUNT'
  | 'PACKET_LOSS'

export type TracerouteAssertion = CoreAssertion<TracerouteAssertionSource>

/**
 * Builder class for creating traceroute monitor assertions.
 * Provides methods to create assertions for traceroute probe responses.
 *
 * @example
 * ```typescript
 * // Response time assertions
 * TracerouteAssertionBuilder.responseTime().lessThan(1000)
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
   * Creates an assertion builder for traceroute response time.
   * @returns A numeric assertion builder for response time in milliseconds.
   */
  static responseTime () {
    return new NumericAssertionBuilder<TracerouteAssertionSource>('RESPONSE_TIME')
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
