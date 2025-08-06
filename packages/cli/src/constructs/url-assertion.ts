import {
  Assertion as CoreAssertion,
  NumericAssertionBuilder,
} from './internal/assertion'

/**
 * Sources that can be used for URL monitor assertions.
 * URL monitors only support status code validation.
 */
type UrlAssertionSource =
  | 'STATUS_CODE'

/**
 * Assertion configuration for URL monitors.
 * Allows validation of HTTP response status codes.
 */
export type UrlAssertion = CoreAssertion<UrlAssertionSource>

/**
 * Builder class for creating URL monitor assertions.
 * Provides methods to create assertions for validating HTTP responses.
 *
 * URL monitors have limited assertion capabilities compared to API checks.
 * They can only validate status codes. For more advanced assertions
 * (headers, body content, response times), use ApiCheck instead.
 *
 * @example
 * ```typescript
 * // Check for specific status code
 * UrlAssertionBuilder.statusCode().equals(200)
 *
 * // Check for successful response (2xx)
 * UrlAssertionBuilder.statusCode().greaterThan(199)
 * UrlAssertionBuilder.statusCode().lessThan(300)
 *
 * // Check for any non-error response
 * UrlAssertionBuilder.statusCode().lessThan(400)
 *
 * // Check for specific client error
 * UrlAssertionBuilder.statusCode().equals(404)
 *
 * // Check for server errors
 * UrlAssertionBuilder.statusCode().greaterThan(499)
 * UrlAssertionBuilder.statusCode().lessThan(600)
 * ```
 *
 * @see {@link https://www.checklyhq.com/docs/url-monitors/ | URL Monitors Documentation}
 */
export class UrlAssertionBuilder {
  /**
   * Creates an assertion builder for HTTP status codes.
   * This is the only type of assertion supported by URL monitors.
   *
   * @returns A numeric assertion builder for status codes
   *
   * @example
   * ```typescript
   * // Basic usage
   * const assertion = UrlAssertionBuilder.statusCode().equals(200)
   *
   * // Check for range of status codes
   * const successAssertion = UrlAssertionBuilder.statusCode().lessThan(400)
   * ```
   */
  static statusCode () {
    return new NumericAssertionBuilder<UrlAssertionSource>('STATUS_CODE')
  }
}
