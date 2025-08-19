import {
  Assertion as CoreAssertion,
  NumericAssertionBuilder,
  GeneralAssertionBuilder,
} from './internal/assertion'

/** Sources that can be used for API check assertions */
type ApiAssertionSource =
  | 'STATUS_CODE'
  | 'JSON_BODY'
  | 'HEADERS'
  | 'TEXT_BODY'
  | 'RESPONSE_TIME'

/**
 * Assertion configuration for API checks.
 * Allows validation of different aspects of HTTP responses.
 */
// Called Assertion instead of ApiAssertion for historical reasons.
export type Assertion = CoreAssertion<ApiAssertionSource>

/**
 * Builder class for creating API check assertions.
 * Provides convenient methods to create assertions for different parts of HTTP responses.
 *
 * @example
 * ```typescript
 * // Status code assertions
 * AssertionBuilder.statusCode().equals(200)
 * AssertionBuilder.statusCode().greaterThan(199)
 * AssertionBuilder.statusCode().lessThan(300)
 *
 * // JSON body assertions using JSONPath
 * AssertionBuilder.jsonBody('$.user.name').equals('John')
 * AssertionBuilder.jsonBody('$.users.length').equals(5)
 * AssertionBuilder.jsonBody('$.data[0].id').isNotNull()
 *
 * // Header assertions
 * AssertionBuilder.headers('content-type').contains('application/json')
 * AssertionBuilder.headers('x-rate-limit-remaining').greaterThan(0)
 *
 * // Text body assertions
 * AssertionBuilder.textBody().contains('Welcome to our API')
 * AssertionBuilder.textBody().notContains('error')
 *
 * // Response time assertions
 * AssertionBuilder.responseTime().lessThan(1000)
 * AssertionBuilder.responseTime().greaterThan(100)
 * ```
 *
 * @see {@link https://jsonpath.com/ | JSONPath Online Evaluator}
 * @see {@link https://www.checklyhq.com/docs/api-checks/assertions/ | API Check Assertions}
 */
// Called AssertionBuilder instead of ApiAssertionBuilder for historical
// reasons.
export class AssertionBuilder {
  /**
   * Creates an assertion builder for HTTP status codes.
   * @returns A numeric assertion builder for status codes
   */
  static statusCode () {
    return new NumericAssertionBuilder<ApiAssertionSource>('STATUS_CODE')
  }

  /**
   * Creates an assertion builder for JSON response body.
   * @param property Optional JSON path to specific property (e.g., '$.user.name')
   * @returns A general assertion builder for JSON body content
   */
  static jsonBody (property?: string) {
    return new GeneralAssertionBuilder<ApiAssertionSource>('JSON_BODY', property)
  }

  /**
   * Creates an assertion builder for HTTP headers.
   * @param property Optional header name to target specific header
   * @param regex Optional regex pattern for header matching
   * @returns A general assertion builder for headers
   */
  static headers (property?: string, regex?: string) {
    return new GeneralAssertionBuilder<ApiAssertionSource>('HEADERS', property, regex)
  }

  /**
   * Creates an assertion builder for text response body.
   * @param property Optional property path for text content
   * @returns A general assertion builder for text body content
   */
  static textBody (property?: string) {
    return new GeneralAssertionBuilder<ApiAssertionSource>('TEXT_BODY', property)
  }

  /**
   * Creates an assertion builder for response time.
   * @returns A numeric assertion builder for response time in milliseconds
   */
  static responseTime () {
    return new NumericAssertionBuilder<ApiAssertionSource>('RESPONSE_TIME')
  }

  /** @deprecated Use {@link responseTime()} instead */
  static responseTme () {
    return AssertionBuilder.responseTime()
  }
}
