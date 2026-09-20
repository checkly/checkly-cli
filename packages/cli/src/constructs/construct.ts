import fs from 'node:fs'
import path from 'node:path'

import { LOGICAL_ID_PATTERN } from '../constants.js'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics.js'
import { Diagnostics } from './diagnostics.js'
import { Session } from './session.js'
import { Ref } from './ref.js'
import { Bundler } from '../services/check-parser/bundler.js'
import { captureDeclaringFile } from './internal/declaring-file.js'

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
  physicalId?: string | number
  /** Whether this construct is a member of the project */
  member: boolean
  /**
   * Absolute path of the file that declares this construct: the user file
   * whose code ran the constructor, read off the call stack, so a construct
   * in a module shared by several check files is attributed to that module
   * and not to whichever check file imported it first. When no user code is
   * on the stack (the CLI created the construct itself, or a test did) it
   * is the parser's current check file, if any.
   */
  checkFileAbsolutePath?: string
  /**
   * The check file the parser was loading when this construct was created,
   * if any. It differs from `checkFileAbsolutePath` when the construct was
   * declared in a module the check file imports, or when helper code in
   * another file created it on the check file's behalf. Relative file
   * paths are resolved next to this file first, as they always were, and
   * next to the declaring file when they do not exist there.
   */
  readonly loadingFileAbsolutePath?: string
  /**
   * Diagnostics recorded during construction. A constructor cannot perform the
   * async work that validate() can, so any issue it notices (e.g. an argument
   * of the wrong type) can be added here and is merged into the caller's
   * Diagnostics by validate().
   */
  readonly earlyDiagnostics = new Diagnostics()

  /**
   * Creates a new construct instance.
   *
   * @param type The type identifier for this construct
   * @param logicalId Unique logical identifier within the project scope
   * @param physicalId Optional physical identifier from the Checkly API
   * @param member Whether this construct is a member of the project
   */
  constructor (type: string, logicalId: string, physicalId?: string | number, member?: boolean) {
    if (typeof logicalId !== 'string') {
      this.earlyDiagnostics.add(new InvalidPropertyValueDiagnostic(
        'logicalId',
        new Error(`Expected a string but received type "${typeof logicalId}".`),
      ))
      logicalId = String(logicalId)
    }
    this.logicalId = logicalId
    this.type = type
    this.physicalId = physicalId
    this.member = member ?? true
    this.loadingFileAbsolutePath = Session.checkFileAbsolutePath
    // One constructor frame per class from Construct down to the class
    // being instantiated sits on top of the stack; the declaring file is
    // the frame below them.
    let constructorChainLength = 1
    for (let cls = new.target; cls && cls !== Construct; cls = Object.getPrototypeOf(cls)) {
      constructorChainLength++
    }
    this.checkFileAbsolutePath = captureDeclaringFile(constructorChainLength) ?? this.loadingFileAbsolutePath
    Session.validateCreateConstruct(this)
  }

  /**
   * @returns A unique description of the Construct instance.
   */
  abstract describe (): string

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
   * Resolves a content file path relative to the check file that was being
   * loaded when this construct was created, or, when the path does not
   * exist there, relative to the file that declares the construct. So a
   * factory called from a check file keeps resolving paths from the check
   * file's directory, and a construct declared in a shared module can
   * keep its script next to that module. An absolute path is returned as
   * is.
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

    const candidates = [...new Set([this.loadingFileAbsolutePath, this.checkFileAbsolutePath])]
      .filter((file): file is string => file !== undefined)
      .map(file => path.join(path.dirname(file), contentPath))
    // A path that exists nowhere resolves against the first base, so the
    // error reported later names the location that was always tried.
    return candidates.find(candidate => fs.existsSync(candidate)) ?? candidates[0]
  }

  /**
   * Validates the Construct, allowing multiple issues to be brought into
   * attention via the provided Diagnostics.
   *
   * @param diagnostics The Diagnostics instance that any issues should be added to.
   * @returns A Promise that resolves when validation is complete.
   */
  // eslint-disable-next-line require-await
  async validate (diagnostics: Diagnostics): Promise<void> {
    diagnostics.extend(this.earlyDiagnostics)

    if (!LOGICAL_ID_PATTERN.test(this.logicalId)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'logicalId',
        new Error(`"${this.logicalId}" contains invalid characters. Only A-Z, a-z, 0-9, _, -, /, #, and . are allowed.`),
      ))
    }
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
  // eslint-disable-next-line require-await, @typescript-eslint/no-unused-vars
  async bundle (bundler: Bundler): Promise<Bundle> {
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
  /** Path to the script file, relative to the file that declares the construct, or absolute */
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
