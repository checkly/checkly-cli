import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder } from './internal/assertion'

type IcmpAssertionSource =
  | 'LATENCY'
  | 'JSON_RESPONSE'

export type IcmpAssertion = CoreAssertion<IcmpAssertionSource>

export type IcmpLatencyProperty = 'avg' | 'min' | 'max' | 'stdDev'

/**
 * Builder class for creating ICMP monitor assertions.
 * Provides methods to create assertions for ICMP ping responses.
 *
 * @example
 * ```typescript
 * // Latency assertions
 * IcmpAssertionBuilder.latency('avg').lessThan(100)
 * IcmpAssertionBuilder.latency('max').lessThan(200)
 * IcmpAssertionBuilder.latency('stdDev').lessThan(50)
 *
 * // JSON response assertions
 * IcmpAssertionBuilder.jsonResponse('$.packetLoss').lessThan(10)
 * IcmpAssertionBuilder.jsonResponse('$.packetsReceived').greaterThan(8)
 * ```
 */
export class IcmpAssertionBuilder {
  /**
   * Creates an assertion builder for ICMP latency metrics.
   * @param property The latency property to assert against:
   *   - `avg`: Average round-trip time in milliseconds
   *   - `min`: Minimum round-trip time in milliseconds
   *   - `max`: Maximum round-trip time in milliseconds
   *   - `stdDev`: Standard deviation of round-trip times
   * @returns A numeric assertion builder for the specified latency metric.
   */
  static latency (property: IcmpLatencyProperty) {
    return new NumericAssertionBuilder<IcmpAssertionSource, IcmpLatencyProperty>('LATENCY', property)
  }

  /**
   * Creates an assertion builder for the JSON formatted response.
   * Use JSONPath expressions to access specific response fields.
   *
   * Available fields include:
   * - `$.hostname`: The target host that was pinged
   * - `$.resolvedIp`: The resolved IP address (if host was a domain name)
   * - `$.ipFamily`: IP family used ('IPv4' or 'IPv6')
   * - `$.pingCount`: Number of pings configured
   * - `$.packetsSent`: Number of ICMP echo requests sent
   * - `$.packetsReceived`: Number of ICMP echo replies received
   * - `$.packetLoss`: Percentage of packets lost (0-100)
   * - `$.latency.avg`: Average round-trip time in milliseconds
   * - `$.latency.min`: Minimum round-trip time in milliseconds
   * - `$.latency.max`: Maximum round-trip time in milliseconds
   * - `$.latency.stdDev`: Standard deviation of round-trip times
   * - `$.pingResults[*].rtt`: Round-trip time for each ping
   * - `$.pingResults[*].ttl`: Time-to-live for each ping
   *
   * @param property Optional JSONPath to specific property (e.g., '$.packetLoss')
   * @returns A general assertion builder for the JSON formatted response.
   */
  static jsonResponse (property?: string) {
    return new GeneralAssertionBuilder<IcmpAssertionSource>('JSON_RESPONSE', property)
  }
}
