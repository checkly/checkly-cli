import { Assertion as CoreAssertion, NumericAssertionBuilder } from './internal/assertion.js'

type TracerouteAssertionSource =
  | 'RESPONSE_TIME'
  | 'HOP_COUNT'
  | 'PACKET_LOSS'

export type TracerouteAssertion = CoreAssertion<TracerouteAssertionSource>

/**
 * The statistical property of the traceroute response time to assert against.
 * The backend requires one of these for `RESPONSE_TIME` assertions.
 */
export type TracerouteResponseTimeProperty = 'avg' | 'min' | 'max' | 'stdDev'

/**
 * A numeric assertion builder for traceroute response time. It defaults to the
 * `avg` property so `responseTime().lessThan(1000)` works out of the box, and
 * exposes `avg()`/`min()`/`max()`/`stdDev()` to select a specific property.
 */
class TracerouteResponseTimeAssertionBuilder
  extends NumericAssertionBuilder<TracerouteAssertionSource, TracerouteResponseTimeProperty> {
  constructor () {
    super('RESPONSE_TIME', 'avg')
  }

  /** Asserts against the average response time. */
  avg () {
    return new NumericAssertionBuilder<TracerouteAssertionSource, TracerouteResponseTimeProperty>('RESPONSE_TIME', 'avg')
  }

  /** Asserts against the minimum response time. */
  min () {
    return new NumericAssertionBuilder<TracerouteAssertionSource, TracerouteResponseTimeProperty>('RESPONSE_TIME', 'min')
  }

  /** Asserts against the maximum response time. */
  max () {
    return new NumericAssertionBuilder<TracerouteAssertionSource, TracerouteResponseTimeProperty>('RESPONSE_TIME', 'max')
  }

  /** Asserts against the standard deviation of the response time. */
  stdDev () {
    return new NumericAssertionBuilder<TracerouteAssertionSource, TracerouteResponseTimeProperty>('RESPONSE_TIME', 'stdDev')
  }
}

/**
 * Builder class for creating traceroute monitor assertions.
 * Provides methods to create assertions for traceroute probe responses.
 *
 * @example
 * ```typescript
 * // Response time assertions (defaults to the average)
 * TracerouteAssertionBuilder.responseTime().lessThan(1000)
 *
 * // Response time assertions against a specific property
 * TracerouteAssertionBuilder.responseTime().max().lessThan(2000)
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
   * Creates an assertion builder for traceroute response time in milliseconds.
   * Defaults to the `avg` property; use `avg()`/`min()`/`max()`/`stdDev()` to
   * select a specific property.
   * @returns A numeric assertion builder for response time.
   */
  static responseTime () {
    return new TracerouteResponseTimeAssertionBuilder()
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
