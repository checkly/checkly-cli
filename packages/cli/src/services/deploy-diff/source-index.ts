import fs from 'node:fs'

import type { TSESTree } from '@typescript-eslint/typescript-estree'

import type { Construct } from '../../constructs/construct.js'
import {
  exportedNamesOf,
  findConstructOptions,
  parseSource,
  type ParsedSource,
  spelledOutPaths,
  WriteBackSkipped,
} from '../write-back/source-file.js'

/**
 * The project's source files as the deploy plan reads them, each parsed
 * once however many constructs it declares. Everything here is best effort:
 * a file that cannot be read or parsed, or a construct whose declaration
 * cannot be found in it, yields `undefined`, and the plan renders without
 * what the source would have told it.
 */
export class SourceIndex {
  readonly #sources = new Map<string, ParsedSource | undefined>()

  source (filePath: string): ParsedSource | undefined {
    if (!this.#sources.has(filePath)) {
      let source: ParsedSource | undefined
      try {
        source = parseSource(filePath, fs.readFileSync(filePath, 'utf8'))
      } catch {
        // A file that cannot be read or parsed tells nothing.
      }
      this.#sources.set(filePath, source)
    }
    return this.#sources.get(filePath)
  }

  /** The options literal of the construct's `new <Class>('<logicalId>', { … })` in the file that declares it. */
  options (construct: Construct): TSESTree.ObjectExpression | undefined {
    const filePath = construct.checkFileAbsolutePath
    const source = filePath !== undefined ? this.source(filePath) : undefined
    if (source === undefined) {
      return undefined
    }
    try {
      return findConstructOptions(source, construct.logicalId, exportedNamesOf(construct))
    } catch (err) {
      if (err instanceof WriteBackSkipped) {
        return undefined
      }
      throw err
    }
  }

  /** The properties the construct's declaration spells out (`ContextOptions.spelledOut`), when it can be read. */
  spelledOut (construct: Construct): ReadonlySet<string> | undefined {
    const options = this.options(construct)
    return options === undefined ? undefined : spelledOutPaths(options)
  }
}
