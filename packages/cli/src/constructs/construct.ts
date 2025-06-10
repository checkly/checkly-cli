import path from 'node:path'

import { Diagnostics } from './diagnostics'
import { Session } from './project'
import { Ref } from './ref'

export interface ConstructLike {
  type: string
  logicalId: string
}

export interface Bundle {
  synthesize (): any | null
}

export interface Validate {
  validate (diagnostics: Diagnostics): Promise<void>
}

export abstract class Construct implements Validate, Bundle {
  type: string
  logicalId: string
  physicalId?: string|number
  member: boolean
  checkFileAbsolutePath?: string

  constructor (type: string, logicalId: string, physicalId?: string|number, member?: boolean) {
    this.logicalId = logicalId
    this.type = type
    this.physicalId = physicalId
    this.member = member ?? true
    this.checkFileAbsolutePath = Session.checkFileAbsolutePath
    Session.validateCreateConstruct(this)
  }

  ref () {
    return Ref.from(this.logicalId)
  }

  allowInChecklyConfig () {
    return false
  }

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

  abstract synthesize (): any | null
}

export interface Entrypoint {
  entrypoint: string
}

export function isEntrypoint (value: any): value is Entrypoint {
  return 'entrypoint' in Object(value)
}

export interface Content {
  content: string
}

export function isContent (value: any): value is Content {
  return 'content' in Object(value)
}
