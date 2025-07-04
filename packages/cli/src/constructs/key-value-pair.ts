/**
 * Represents a key-value pair used in various Checkly constructs.
 * This interface is used by HTTP headers, query parameters, and environment variables.
 * 
 * @example
 * ```typescript
 * // HTTP header
 * const header: KeyValuePair = {
 *   key: 'Authorization',
 *   value: 'Bearer {{API_TOKEN}}',
 *   secret: true
 * }
 * 
 * // Environment variable
 * const envVar: KeyValuePair = {
 *   key: 'API_URL',
 *   value: 'https://api.example.com',
 *   locked: true
 * }
 * ```
 */
export default interface KeyValuePair {
  /** The key/name of the pair */
  key: string
  /** The value associated with the key */
  value: string
  /** Whether the value is locked and cannot be modified at runtime */
  locked?: boolean
  /** Whether the value should be treated as sensitive/secret */
  secret?: boolean
}
