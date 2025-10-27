import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder } from './internal/assertion'

type DnsAssertionSource =
  | 'RESPONSE_CODE'
  | 'RESPONSE_TIME'
  | 'TEXT_ANSWER'
  | 'JSON_ANSWER'

export type DnsAssertion = CoreAssertion<DnsAssertionSource>

/**
 * Builder class for creating DNS monitor assertions.
 * Provides methods to create assertions for DNS query responses.
 *
 * @example
 * ```typescript
 * // Response time assertions
 * DnsAssertionBuilder.responseTime().lessThan(1000)
 * DnsAssertionBuilder.responseTime().greaterThan(100)
 *
 * // Response code assertions
 * DnsAssertionBuilder.responseCode().equals('NOERROR')
 * DnsAssertionBuilder.responseCode().equals('NXDOMAIN')
 * ```
 */
export class DnsAssertionBuilder {
  /**
   * Creates an assertion builder for DNS response codes.
   * @returns A general assertion builder for the response code.
   */
  static responseCode () {
    return new GeneralAssertionBuilder<DnsAssertionSource>('RESPONSE_CODE')
  }

  /**
   * Creates an assertion builder for DNS response time.
   * @returns A numeric assertion builder for response time in milliseconds.
   */
  static responseTime () {
    return new NumericAssertionBuilder<DnsAssertionSource>('RESPONSE_TIME')
  }

  /**
   * Creates an assertion builder for the answer in common plain text format.
   * @param regex An optional regular expression with at least one capture
   * group. If set, assertion operators will apply against the value of the
   * first capture group instead of the entire answer.
   * @returns A general assertion builder for the answer.
   */
  static textAnswer (regex?: string) {
    return new GeneralAssertionBuilder<DnsAssertionSource>('TEXT_ANSWER', regex)
  }

  /**
   * Creates an assertion builder for the JSON formatted answer.
   * @param property Optional JSON path to specific property (e.g., '$.Answer[0].data')
   * @returns A general assertion builder for the JSON formatted answer.
   */
  static jsonAnswer (property?: string) {
    return new GeneralAssertionBuilder<DnsAssertionSource>('JSON_ANSWER', property)
  }
}
