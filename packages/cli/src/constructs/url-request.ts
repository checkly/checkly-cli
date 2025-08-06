import { IPFamily } from './ip'
import { UrlAssertion } from './url-assertion'

/**
 * Configuration for a URL monitor HTTP request.
 * Defines the URL to check and validation rules for the response.
 * URL monitors only support GET requests - for other HTTP methods, use ApiCheck.
 */
export interface UrlRequest {
  /**
   * The URL to monitor.
   * Must be a valid HTTP or HTTPS URL.
   *
   * @maxLength 2048
   * @example 'https://api.example.com/health'
   */
  url: string

  /**
   * IP family version to use for the connection.
   * Useful when you need to specifically test IPv4 or IPv6 connectivity.
   *
   * @defaultValue 'IPv4'
   * @example 'IPv6'  // Force IPv6 connection
   */
  ipFamily?: IPFamily

  /**
   * Whether to follow HTTP redirects automatically.
   * When true, the monitor will follow redirect responses (3xx status codes).
   * When false, a redirect will be treated as the final response.
   *
   * @defaultValue true
   * @example
   * ```typescript
   * // Don't follow redirects - useful for testing redirect configurations
   * followRedirects: false
   * ```
   */
  followRedirects?: boolean

  /**
   * Whether to skip SSL certificate verification.
   * Only use this for testing purposes or for internal endpoints with self-signed certificates.
   *
   * @defaultValue false
   * @example
   * ```typescript
   * // Skip SSL verification for internal/development endpoints
   * skipSSL: true
   * ```
   */
  skipSSL?: boolean

  /**
   * Assertions to validate the HTTP response.
   * URL monitors only support status code assertions.
   * For more complex assertions (headers, body content), use ApiCheck.
   *
   * @example
   * ```typescript
   * assertions: [
   *   UrlAssertionBuilder.statusCode().equals(200),
   *   // Or check for any successful status
   *   UrlAssertionBuilder.statusCode().lessThan(400)
   * ]
   * ```
   */
  assertions?: UrlAssertion[]
}
