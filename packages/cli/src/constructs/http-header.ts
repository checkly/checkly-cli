import KeyValuePair from './key-value-pair'

/**
 * Represents an HTTP header for API checks.
 *
 * @example
 * ```typescript
 * const authHeader: HttpHeader = {
 *   key: 'Authorization',
 *   value: 'Bearer {{API_TOKEN}}'
 * }
 *
 * const contentTypeHeader: HttpHeader = {
 *   key: 'Content-Type',
 *   value: 'application/json'
 * }
 * ```
 */
export type HttpHeader = KeyValuePair
