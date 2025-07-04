/**
 * Represents a key-value pair used in various Checkly constructs.
 * This interface is used by HTTP headers, query parameters, and environment variables.
 * 
 * @example
 * ```typescript
 * // HTTP header (supports locked encryption)
 * const header: KeyValuePair = {
 *   key: 'Authorization',
 *   value: 'Bearer {{API_TOKEN}}'
 * }
 * 
 * // Query parameter (no encryption support)
 * const queryParam: KeyValuePair = {
 *   key: 'version',
 *   value: 'v1'
 * }
 * 
 * // Environment variable
 * const envVar: KeyValuePair = {
 *   key: 'API_TOKEN',
 *   value: 'secret-token-value',
 *   secret: true  // For sensitive environment variables only
 * }
 * ```
 */
export default interface KeyValuePair {
  /** The key/name of the pair */
  key: string
  /** The value associated with the key */
  value: string
  /** 
   * Whether the value is locked and encrypted (supported by headers and environment variables).
   * @deprecated For environment variables, use `secret` instead. 
   */
  locked?: boolean
  /** 
   * Whether the value should be treated as sensitive/secret (environment variables only).
   * Not supported for HTTP headers or query parameters.
   */
  secret?: boolean
}
