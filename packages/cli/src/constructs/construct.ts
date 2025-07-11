import path from 'node:path'

import { Diagnostics } from './diagnostics'
import { Session } from './project'
import { Ref } from './ref'

/**
 * Base interface for construct-like objects in the Checkly CLI system.
 * Used for type checking and identifying construct objects.
 */
export interface ConstructLike {
  /** The type identifier of the construct */
  type: string
  /** Unique logical identifier within the project scope */
  logicalId: string
}

/**
 * Interface for objects that can be bundled into a synthesizable representation.
 * Provides the contract for converting constructs into their deployable form.
 */
export interface Bundle {
  /** Synthesizes the construct into its deployable representation */
  synthesize (): any | null
}

/**
 * Interface for constructs that can be validated.
 * Provides the contract for validating construct configuration and reporting issues.
 */
export interface Validate {
  /** 
   * Validates the construct, reporting any issues via the provided diagnostics.
   * @param diagnostics The diagnostics instance to add any validation issues to
   */
  validate (diagnostics: Diagnostics): Promise<void>
}

/**
 * Abstract base class for all constructs in the Checkly CLI system.
 * Provides common functionality for validation, bundling, and resource management.
 * 
 * This class is extended by all built-in constructs like ApiCheck, BrowserCheck, etc.
 * It should not be extended directly by user code.
 */
export abstract class Construct implements Validate, Bundle {
  /** The type identifier of the construct */
  type: string
  /** Unique logical identifier within the project scope */
  logicalId: string
  /** Physical identifier from the Checkly API (if exists) */
  physicalId?: string|number
  /** Whether this construct is a member of the project */
  member: boolean
  /** Absolute path to the check file that created this construct */
  checkFileAbsolutePath?: string

  /**
   * Creates a new construct instance.
   * 
   * @param type The type identifier for this construct
   * @param logicalId Unique logical identifier within the project scope
   * @param physicalId Optional physical identifier from the Checkly API
   * @param member Whether this construct is a member of the project
   */
  constructor (type: string, logicalId: string, physicalId?: string|number, member?: boolean) {
    this.logicalId = logicalId
    this.type = type
    this.physicalId = physicalId
    this.member = member ?? true
    this.checkFileAbsolutePath = Session.checkFileAbsolutePath
    Session.validateCreateConstruct(this)
  }

  /**
   * Creates a reference to this construct that can be used in other constructs.
   * 
   * @returns A reference object that can be used to link to this construct
   */
  ref () {
    return Ref.from(this.logicalId)
  }

  /**
   * Determines whether this construct is allowed to be referenced in checkly.config.ts.
   * Most constructs should not be directly referenced in the config file.
   * 
   * @returns true if this construct can be used in checkly.config.ts, false otherwise
   */
  allowInChecklyConfig () {
    return false
  }

  /**
   * Resolves a content file path relative to the check file that created this construct.
   * If the path is already absolute, returns it as-is.
   * 
   * @param contentPath The relative or absolute path to resolve
   * @returns The absolute path to the content file
   * @throws Error if checkFileAbsolutePath is not set and a relative path is provided
   */
  resolveContentFilePath (contentPath: string): string {
    if (path.isAbsolute(contentPath)) {
      return contentPath
    }

    if (!this.checkFileAbsolutePath) {
      throw new Error('Internal error: attempting to use relative content file path without checkFileAbsolutePath set')
    }

    return path.join(path.dirname(this.checkFileAbsolutePath), contentPath)
  }

  /**
   * Validates the Construct, allowing multiple issues to be brought into
   * attention via the provided Diagnostics.
   *
   * @param diagnostics The Diagnostics instance that any issues should be added to.
   * @returns A Promise that resolves when validation is complete.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async validate (diagnostics: Diagnostics): Promise<void> {
    return
  }

  /**
   * Bundles the Construct into a representation that can be synthesized. By
   * default, that representation is the Construct itself, but a different
   * representation may also be returned.
   *
   * Can be used to perform heavier tasks that the Construct constructor may
   * not be suitable for.
   *
   * @returns A Promise that resolves to the bundled representation of the Construct.
   */
  async bundle (): Promise<Bundle> {
    return this
  }

  /**
   * Synthesizes the construct into its deployable representation.
   * This method must be implemented by all concrete construct classes.
   * 
   * @returns The synthesized representation of the construct, or null if not applicable
   */
  abstract synthesize (): any | null
}

/**
 * Interface for script configurations that reference an external file.
 * Used when script code is stored in a separate file rather than inline.
 */
export interface Entrypoint {
  /** Path to the script file, relative to the check file or absolute */
  entrypoint: string
}

/**
 * Type guard to check if a value is an Entrypoint object.
 * 
 * @param value The value to check
 * @returns true if the value is an Entrypoint, false otherwise
 */
export function isEntrypoint (value: any): value is Entrypoint {
  return 'entrypoint' in Object(value)
}

/**
 * Interface for script configurations that contain inline code.
 * Used when script code is provided directly as a string.
 */
export interface Content {
  /** The inline script content as a string */
  content: string
}

/**
 * Type guard to check if a value is a Content object.
 * 
 * @param value The value to check
 * @returns true if the value is a Content, false otherwise
 */
export function isContent (value: any): value is Content {
  return 'content' in Object(value)
}
