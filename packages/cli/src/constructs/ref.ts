/**
 * Represents a reference to a construct that can be used to link constructs together.
 * Used for establishing relationships between constructs without direct dependencies.
 * 
 * @example
 * ```typescript
 * // Create a reference to a check group
 * const groupRef = Ref.from('my-check-group')
 * 
 * // Use the reference in a check
 * const check = new ApiCheck('my-check', {
 *   name: 'API Check',
 *   request: { url: 'https://api.example.com', method: 'GET' },
 *   groupId: groupRef
 * })
 * ```
 */
export class Ref {
  /** The reference string that identifies the target construct */
  ref: string
  
  /**
   * Creates a new reference instance.
   * Use the static `from` method instead of creating instances directly.
   * 
   * @param ref The reference string
   */
  private constructor (ref: string) {
    this.ref = ref
  }

  /**
   * Creates a reference from a logical ID string.
   * 
   * @param ref The logical ID of the construct to reference
   * @returns A new Ref instance that can be used to link constructs
   */
  static from (ref: string) {
    return new Ref(ref)
  }
}
