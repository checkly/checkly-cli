import KeyValuePair from './key-value-pair'

/**
 * Represents a query parameter for API checks.
 *
 * @example
 * ```typescript
 * const apiKeyParam: QueryParam = {
 *   key: 'api_key',
 *   value: '{{API_KEY}}'  // Use environment variables for sensitive data
 * }
 *
 * const versionParam: QueryParam = {
 *   key: 'version',
 *   value: 'v1'
 * }
 * ```
 */
export type QueryParam = KeyValuePair
