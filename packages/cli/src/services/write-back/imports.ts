import type { TSESTree } from '@typescript-eslint/typescript-estree'

import { indentationAt, lineEndingOf } from './literal-edit.js'
import {
  appendAfterLast,
  checklyBindings,
  CONSTRUCTS_MODULE,
  isChecklyRequire,
  type Node,
  type ParsedSource,
  type Splice,
  stringOf,
  tokensBetween,
  usesIdentifier,
} from './source-file.js'

/**
 * Makes the classes a helper expression references (`Frequency`,
 * `RetryStrategyBuilder`, an assertion builder — all exports of
 * `checkly/constructs`) available in a construct file: under the local name
 * an existing import or `require` of a checkly package already binds them
 * to, or by adding them to the file's top-level
 * `import { … } from 'checkly/constructs'` (or
 * `const { … } = require('checkly/constructs')`). A name the file already
 * uses for something else is refused, and so is every name when the file
 * has no such declaration to extend: no statement is ever added, which
 * would mean guessing the file's module style.
 */

export interface ImportResolution {
  /** Names that cannot be made available, with the reason. */
  refused: Map<string, string>
  /** Names the file binds nowhere yet, which `appendImports` can add. */
  missing: string[]
}

/** Which of `names` the file lacks, and which it cannot take. Independent of which of them end up written. */
export function resolveImports (source: ParsedSource, names: readonly string[]): ImportResolution {
  const { program } = source
  const refused = new Map<string, string>()
  const missing: string[] = []
  for (const name of new Set(names)) {
    if (checklyBindings(program, new Set([name])).size > 0) {
      continue
    }
    if (usesIdentifier(program, name)) {
      refused.set(name, `${name} is already used for something else in this file`)
    } else if (constructsDeclaration(source) === undefined) {
      refused.set(name, `add \`import { ${name} } from '${CONSTRUCTS_MODULE}'\` by hand`)
    } else {
      missing.push(name)
    }
  }
  return { refused, missing }
}

/**
 * The edit that adds `names` (each one `resolveImports` reported missing) to
 * the file's `checkly/constructs` declaration, after its last specifier: on
 * the same line when the list is one line, otherwise one per line at the
 * last specifier's indentation, after the line the last specifier (or its
 * comma, or a comment behind it) ends on, keeping the trailing comma when
 * the list has one.
 */
export function appendImports (source: ParsedSource, names: readonly string[]): Splice | undefined {
  const declaration = constructsDeclaration(source)
  if (declaration === undefined || names.length === 0) {
    return undefined
  }
  const { text } = source
  const { last, open, close } = declaration
  if (!text.slice(open, close).includes('\n')) {
    return { start: last.range[1], end: last.range[1], text: names.map(name => `, ${name}`).join('') }
  }
  return appendAfterLast(source, last, close, names, indentationAt(text, last.range[0]), lineEndingOf(text))
}

interface Declaration {
  /** The last named specifier, or pattern property. */
  last: Node
  /** The offset of the opening brace. */
  open: number
  /** The offset of the closing brace. */
  close: number
}

/**
 * The top-level declaration that names what `checkly/constructs` exports:
 * a value import with named specifiers, or, for a CommonJS file, a
 * destructuring `require` of the same module.
 */
function constructsDeclaration (source: ParsedSource): Declaration | undefined {
  const { program } = source
  const brace = (start: number, end: number, value: '{' | '}'): number | undefined =>
    tokensBetween(source, start, end).find(token => token.kind === 'token' && token.value === value)?.range[0]
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration' && statement.source.value === CONSTRUCTS_MODULE
      && statement.importKind !== 'type') {
      const named = statement.specifiers.filter(specifier => specifier.type === 'ImportSpecifier')
      if (named.length === 0) {
        continue
      }
      const last = named[named.length - 1]
      const open = brace(statement.range[0], named[0].range[0], '{')
      const close = brace(last.range[1], statement.source.range[0], '}')
      if (open !== undefined && close !== undefined) {
        return { last, open, close }
      }
    }
    if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations) {
        if (declarator.id.type !== 'ObjectPattern' || !isChecklyRequire(declarator.init)
          || stringOf((declarator.init as TSESTree.CallExpression).arguments[0]) !== CONSTRUCTS_MODULE) {
          continue
        }
        const properties = declarator.id.properties.filter(property => property.type === 'Property')
        if (properties.length > 0) {
          const pattern = declarator.id
          return { last: properties[properties.length - 1], open: pattern.range[0], close: pattern.range[1] - 1 }
        }
      }
    }
  }
  return undefined
}
