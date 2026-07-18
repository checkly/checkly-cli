import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder } from './internal/assertion'

type DnsAssertionSource =
  | 'RESPONSE_CODE'
  | 'RESPONSE_TIME'
  | 'TEXT_ANSWER'
  | 'JSON_ANSWER'
  | 'ANSWER'

export type DnsAssertion = CoreAssertion<DnsAssertionSource>

/**
 * Quantifier for `ANSWER` assertions — determines how the comparison is
 * applied across the answer records:
 *
 * - `EVERY`: the comparison must hold for every record (fails on zero records).
 * - `SOME`: the comparison must hold for at least one record.
 * - `NONE`: the comparison must hold for no record.
 */
export type DnsAssertionQuantifier = 'EVERY' | 'SOME' | 'NONE'

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

  /**
   * Creates an assertion builder for the `data` (record value) of the answer
   * records, evaluated across the records with the given quantifier.
   *
   * @param quantifier `EVERY`, `SOME`, or `NONE`.
   * @returns A general assertion builder for the answer `data`.
   * @example
   * ```typescript
   * DnsAssertionBuilder.answerData('EVERY').equals('192.0.2.1')
   * DnsAssertionBuilder.answerData('SOME').matches('^10\\.')
   * ```
   */
  static answerData (quantifier: DnsAssertionQuantifier) {
    return new GeneralAssertionBuilder<DnsAssertionSource>('ANSWER', 'data', undefined, quantifier)
  }

  /**
   * Creates an assertion builder for the `name` (owner name) of the answer
   * records, evaluated across the records with the given quantifier.
   *
   * @param quantifier `EVERY`, `SOME`, or `NONE`.
   * @returns A general assertion builder for the answer `name`.
   */
  static answerName (quantifier: DnsAssertionQuantifier) {
    return new GeneralAssertionBuilder<DnsAssertionSource>('ANSWER', 'name', undefined, quantifier)
  }

  /**
   * Creates an assertion builder for the `type` (record type) of the answer
   * records, evaluated across the records with the given quantifier.
   *
   * @param quantifier `EVERY`, `SOME`, or `NONE`.
   * @returns A general assertion builder for the answer `type`.
   */
  static answerType (quantifier: DnsAssertionQuantifier) {
    return new GeneralAssertionBuilder<DnsAssertionSource>('ANSWER', 'type', undefined, quantifier)
  }

  /**
   * Creates an assertion builder for the `ttl` of the answer records,
   * evaluated across the records with the given quantifier.
   *
   * @param quantifier `EVERY`, `SOME`, or `NONE`.
   * @returns A numeric assertion builder for the answer `ttl`.
   * @example
   * ```typescript
   * DnsAssertionBuilder.answerTtl('EVERY').greaterThan(300)
   * ```
   */
  static answerTtl (quantifier: DnsAssertionQuantifier) {
    return new NumericAssertionBuilder<DnsAssertionSource>('ANSWER', 'ttl', quantifier)
  }

  /**
   * Creates an assertion builder for the number of answer records. Compared
   * numerically over the whole answer set, so no quantifier is used.
   *
   * @returns A numeric assertion builder for the answer record count.
   * @example
   * ```typescript
   * DnsAssertionBuilder.answerCount().greaterThan(0)
   * ```
   */
  static answerCount () {
    return new NumericAssertionBuilder<DnsAssertionSource>('ANSWER', 'count')
  }
}
