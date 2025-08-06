/**
 * Represents a reference to a construct that can be used to link constructs together.
 * Used for establishing relationships between constructs without direct dependencies.
 *
 * @example
 * ```typescript
 * // Reference an existing check group by ID (recommended)
 * const existingGroup = CheckGroupV2.fromId(123)
 *
 * // Use the group property, not groupId
 * const check = new ApiCheck('my-check', {
 *   name: 'API Check',
 *   request: { url: 'https://api.example.com', method: 'GET' },
 *   group: existingGroup  // Use group property with CheckGroupV2
 * })
 *
 * // Or create a new group
 * const newGroup = new CheckGroupV2('my-group', {
 *   name: 'My Check Group',
 *   activated: true
 * })
 *
 * const check2 = new ApiCheck('my-check-2', {
 *   name: 'Another API Check',
 *   request: { url: 'https://api.example.com/v2', method: 'GET' },
 *   group: newGroup
 * })
 * ```
 *
 * @internal The Ref class itself is primarily for internal use. Users should not create Ref instances directly.
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
