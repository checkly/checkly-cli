import KeyValuePair from './key-value-pair'

/**
 * Represents an environment variable for checks.
 * Environment variables can be used in check scripts and configurations.
 * 
 * @example
 * ```typescript
 * const apiUrl: EnvironmentVariable = {
 *   key: 'API_URL',
 *   value: 'https://api.example.com',
 *   locked: true
 * }
 * 
 * const secretToken: EnvironmentVariable = {
 *   key: 'SECRET_TOKEN',
 *   value: 'my-secret-token',
 *   secret: true
 * }
 * ```
 */
export type EnvironmentVariable = KeyValuePair
