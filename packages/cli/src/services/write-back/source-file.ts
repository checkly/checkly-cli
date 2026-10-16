import path from 'node:path'
import * as acorn from 'acorn'
import type { TSESTree } from '@typescript-eslint/types'

import * as constructs from '../../constructs/index.js'
import type { Construct } from '../../constructs/construct.js'
import { loadOxcParser, parseWithOxc, type ParseSync } from '../oxc-parser.js'

/**
 * Reads a construct's source file far enough to find the `new X('id', { … })`
 * that declared it, so `literal-edit.ts` can splice values into that options
 * object by byte range.
 *
 * Two parsers, one AST shape: `.js`/`.mjs`/`.cjs` go through acorn and
 * TypeScript and JSX through oxc-parser, as the check dependency parser reads
 * them. Both produce ESTree nodes carrying `range` (oxc's TypeScript nodes
 * are the ones `@typescript-eslint/types` describes), and only `range` and
 * the node types below are read. Recast (which edits `checkly.config.ts` elsewhere in the CLI) is not
 * used: its acorn parser cannot read TypeScript, and reprinting a touched
 * node re-quotes it, whereas splicing by range leaves every other byte of the
 * file exactly as the user wrote it.
 */

const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx'])

/** Why a file, a construct or a value cannot be edited; the message is shown to the user as the reason it was skipped. */
export class WriteBackSkipped extends Error {}

export type Node = TSESTree.Node

/** A token or a comment of the parsed file: only its kind and where it sits are read. */
export interface SourceToken {
  kind: 'token' | 'comment'
  /** The token's text; empty for a comment. */
  value: string
  range: [number, number]
}

/**
 * A parsed file with its comments, which the splicer needs to tell a comma
 * of the source from one inside a comment.
 */
export interface ParsedSource {
  /** The text the program was parsed from; every range below indexes it. */
  text: string
  program: TSESTree.Program
  /** The `[start, end)` of every comment, in source order. */
  comments: Array<[number, number]>
}

/** A replacement of the bytes `[start, end)` of the parsed text. */
export interface Splice {
  start: number
  end: number
  text: string
}

const WORD_CHARACTER = /[\p{ID_Continue}$\u200c\u200d]/u

/**
 * The tokens and comments lying within `[start, end)`, read off the text of
 * a gap between two nodes, such as between a list's last member and its
 * closing bracket, or between `import` and a specifier. Such a gap holds
 * only whitespace, comments, punctuation and keywords or names (`from`, a
 * default import), never a string or a regular expression, so outside the
 * parser's comments each run of word characters is one token and every
 * other non-space character is a one-character token.
 */
export function gapTokens (source: ParsedSource, start: number, end: number): SourceToken[] {
  const { text, comments } = source
  const tokens: SourceToken[] = []
  const first = comments.findIndex(comment => comment[0] >= start)
  let next = first === -1 ? comments.length : first
  let at = start
  while (at < end) {
    const comment = comments[next]
    if (comment !== undefined && comment[0] === at) {
      if (comment[1] <= end) {
        tokens.push({ kind: 'comment', value: '', range: comment })
      }
      at = comment[1]
      next++
    } else if (/\s/.test(text[at])) {
      at++
    } else {
      let tokenEnd = at + 1
      if (WORD_CHARACTER.test(text[at])) {
        while (tokenEnd < end && WORD_CHARACTER.test(text[tokenEnd])) {
          tokenEnd++
        }
      }
      tokens.push({ kind: 'token', value: text.slice(at, tokenEnd), range: [at, tokenEnd] })
      at = tokenEnd
    }
  }
  return tokens
}

const CHECKLY_MODULE = /^checkly(\/.*)?$/

/** The one module that exports the constructs and their helpers by name. */
export const CONSTRUCTS_MODULE = 'checkly/constructs'

export function parseSource (filePath: string, text: string, loadParser = loadOxcParser): ParsedSource {
  const extension = path.extname(filePath)
  if (!SOURCE_EXTENSIONS.has(extension)) {
    throw new WriteBackSkipped(`${extension === '' ? 'the file' : `"${extension}"`} is not a JavaScript or TypeScript file`)
  }
  try {
    if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
      const comments: Array<[number, number]> = []
      // The same options the check dependency parser reads .js files with,
      // so the two agree on what parses.
      const program = acorn.parse(text, {
        ecmaVersion: 'latest',
        ranges: true,
        allowHashBang: true,
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        onComment: (_block, _text, start, end) => comments.push([start, end]),
      }) as unknown as TSESTree.Program
      return { text, program, comments }
    }
    let parseSync: ParseSync
    try {
      parseSync = loadParser()
    } catch (err: any) {
      // oxc-parser's own reason, e.g. "Cannot find native binding.", without
      // the reinstall instructions or require stack that follow it.
      const cause = err?.cause ?? err
      const reason = String(cause instanceof Error ? cause.message : cause).split('\n')[0].split(/(?<=\.)\s/)[0]
      throw new WriteBackSkipped(`oxc-parser, which reads TypeScript and JSX files, failed to load (${reason});`
        + ' reinstall the project\'s dependencies')
    }
    // Without `preserveParens`, a parenthesized expression's range excludes
    // its parentheses, as typescript-estree's and acorn's do.
    const result = parseWithOxc(parseSync, filePath, text, { range: true, preserveParens: false })
    return {
      text,
      program: result.program as unknown as TSESTree.Program,
      comments: result.comments.map(({ start, end }): [number, number] => [start, end]),
    }
  } catch (err: any) {
    if (err instanceof WriteBackSkipped) {
      throw err
    }
    throw new WriteBackSkipped(`could not parse the file: ${err.message}`)
  }
}

/**
 * Every node below (and including) `root`, in source order: a parent before
 * its children, and siblings by where they start, whatever order the parser
 * put their keys in. Only object-valued keys are followed, which covers every
 * ESTree child slot.
 */
export function* walk (root: Node): Generator<Node> {
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const node = stack.pop() as Node
    yield node
    const children: Node[] = []
    for (const [key, value] of Object.entries(node)) {
      // `parent` would cycle.
      if (key === 'parent') {
        continue
      }
      if (Array.isArray(value)) {
        for (const element of value) {
          if (isNode(element)) {
            children.push(element)
          }
        }
      } else if (isNode(value)) {
        children.push(value)
      }
    }
    children.sort((a, b) => a.range[0] - b.range[0])
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i])
    }
  }
}

function isNode (value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

/** The string a literal argument spells, for a plain string literal or a template with no `${}` in it. */
export function stringOf (node: Node | null | undefined): string | undefined {
  if (node === null || node === undefined) {
    return undefined
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
    return node.quasis[0].value.cooked ?? undefined
  }
  return undefined
}

/**
 * The local names this file binds to the given exported names of a checkly
 * package: `import { ApiCheck } from 'checkly/constructs'`,
 * `import { ApiCheck as Api } from 'checkly'`, and the top-level
 * `const { ApiCheck } = require('checkly/constructs')` (with or without a
 * rename). Anything bound another way — a namespace import, a re-export from
 * the user's own module, a wrapper class — is not a construct call this
 * module can recognise, which keeps it from editing the options of a class
 * that merely shares the name. A type-only import (`import type`, or a
 * `type` specifier) binds nothing at runtime and is not a binding here.
 * Scope is not tracked: a local that shadows the import inside a function
 * is taken for it, which the logical id and the later read-back of the edit
 * bound.
 */
export function checklyBindings (program: TSESTree.Program, exportedNames: ReadonlySet<string>): Set<string> {
  const locals = new Set<string>()
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      if (typeof statement.source.value !== 'string' || !CHECKLY_MODULE.test(statement.source.value)
        || statement.importKind === 'type') {
        continue
      }
      for (const specifier of statement.specifiers) {
        if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type') {
          continue
        }
        const imported = specifier.imported.type === 'Identifier' ? specifier.imported.name : stringOf(specifier.imported)
        if (imported !== undefined && exportedNames.has(imported)) {
          locals.add(specifier.local.name)
        }
      }
    } else if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations) {
        if (declarator.id.type !== 'ObjectPattern' || !isChecklyRequire(declarator.init)) {
          continue
        }
        for (const property of declarator.id.properties) {
          if (property.type !== 'Property' || property.computed || property.value.type !== 'Identifier') {
            continue
          }
          const imported = property.key.type === 'Identifier' ? property.key.name : stringOf(property.key)
          if (imported !== undefined && exportedNames.has(imported)) {
            locals.add(property.value.name)
          }
        }
      }
    }
  }
  return locals
}

/** The one local name the file binds an exported name to, if any (the first when several). */
export function localBinding (program: TSESTree.Program, name: string): string | undefined {
  return [...checklyBindings(program, new Set([name]))][0]
}

/**
 * The splice that appends `members` to a multi-line list after its last
 * member: one per line at `indentation`, after the line the last member
 * (or its comma) ends on, so a comment on that line stays with that
 * member — unless a comment runs on past that line end, in which case they
 * go right after the member's comma rather than into the comment. The
 * trailing comma is kept when the list has one, and added to the last
 * member when it has none; `close` is the offset of the closing bracket.
 */
export function appendAfterLast (
  source: ParsedSource,
  last: Node,
  close: number,
  members: readonly string[],
  indentation: string,
  lineEnding: string,
): Splice {
  const { text } = source
  const comma = gapTokens(source, last.range[1], close).find(token => token.kind === 'token' && token.value === ',')
  const afterMember = comma === undefined ? last.range[1] : comma.range[1]
  const breakAt = text.indexOf('\n', afterMember)
  const lineEnd = breakAt === -1 || breakAt >= close
    ? afterMember
    : text[breakAt - 1] === '\r' ? breakAt - 1 : breakAt
  const straddles = gapTokens(source, last.range[1], close)
    .some(token => token.range[0] < lineEnd && token.range[1] > lineEnd)
  const at = straddles ? afterMember : lineEnd
  const lines = members.map(member => `${lineEnding}${indentation}${member}`).join(',')
  if (comma === undefined) {
    // The comma goes on the member; whatever sat between it and the line
    // end (a comment) is kept, and the new lines follow.
    return { start: last.range[1], end: at, text: `,${text.slice(last.range[1], at)}${lines}` }
  }
  return { start: at, end: at, text: `${lines},` }
}

export function isChecklyRequire (node: Node | null | undefined): boolean {
  return node !== null && node !== undefined
    && node.type === 'CallExpression'
    && node.callee.type === 'Identifier' && node.callee.name === 'require'
    && node.arguments.length === 1
    && CHECKLY_MODULE.test(stringOf(node.arguments[0]) ?? '')
}

/** A name that can be written as an identifier: a variable, or an object key without quotes. */
export const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** The names `checkly/constructs` exports for a construct's class; empty for a class of the user's own. */
export function exportedNamesOf (construct: Construct): Set<string> {
  const names = new Set<string>()
  for (const [name, value] of Object.entries(constructs)) {
    if (value === construct.constructor) {
      names.add(name)
    }
  }
  return names
}

/** Whether a node is `new <Class>('<logicalId>', …)` of a class one of `locals` is bound to. */
function isConstructCall (
  node: Node | null | undefined,
  locals: ReadonlySet<string>,
  logicalId: string,
): node is TSESTree.NewExpression {
  return node?.type === 'NewExpression' && node.callee.type === 'Identifier' && locals.has(node.callee.name)
    && stringOf(node.arguments[0]) === logicalId
}

/**
 * The options object literal of the one `new <Class>('<logicalId>', { … })`
 * in the file, where `<Class>` is bound to one of `exportedNames` from a
 * checkly package.
 *
 * @throws WriteBackSkipped when the file has no such call, several of them,
 * or its options are not a plain object literal (a variable, a spread, a call,
 * a TypeScript `as`/`satisfies` wrapper): anything the rewriter cannot edit
 * without guessing what the code means.
 */
export function findConstructOptions (
  { program }: ParsedSource,
  logicalId: string,
  exportedNames: ReadonlySet<string>,
): TSESTree.ObjectExpression {
  const locals = checklyBindings(program, exportedNames)
  const names = [...exportedNames].sort().join(' or ')
  if (locals.size === 0) {
    throw new WriteBackSkipped(`${names} is not imported from checkly in this file`)
  }
  const matches: TSESTree.NewExpression[] = []
  for (const node of walk(program)) {
    if (isConstructCall(node, locals, logicalId)) {
      matches.push(node)
    }
  }
  if (matches.length === 0) {
    throw new WriteBackSkipped(`no \`new ${[...locals].sort().join('|')}('${logicalId}', …)\` found in this file`)
  }
  if (matches.length > 1) {
    throw new WriteBackSkipped(`several constructs use the logical id '${logicalId}' in this file`)
  }
  const options = matches[0].arguments[1]
  if (options === undefined || options.type !== 'ObjectExpression') {
    throw new WriteBackSkipped('its options are not a plain object literal')
  }
  if (options.properties.some(property => property.type === 'SpreadElement')) {
    throw new WriteBackSkipped('its options spread another object')
  }
  return options
}

/**
 * The name of the top-level variable the file initialises with its one
 * `new <Class>('<logicalId>', …)`, exported or not, where `<Class>` is bound
 * to one of `exportedNames` from a checkly package. None when the construct
 * is not declared that way (made inside a function or a loop, passed straight
 * to another call, destructured), or when several declarations match.
 */
export function findConstructVariable (
  { program }: ParsedSource,
  logicalId: string,
  exportedNames: ReadonlySet<string>,
): string | undefined {
  const locals = checklyBindings(program, exportedNames)
  const names: string[] = []
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration') {
      continue
    }
    for (const { id, init } of declaration.declarations) {
      if (id.type === 'Identifier' && isConstructCall(init, locals, logicalId)) {
        names.push(id.name)
      }
    }
  }
  return names.length === 1 ? names[0] : undefined
}

/** The name of a plain `key: value` member, or undefined for a spread, method, accessor or computed key. */
export function memberName (property: TSESTree.Property | TSESTree.SpreadElement): string | undefined {
  if (property.type !== 'Property' || property.computed || property.kind !== 'init' || property.method) {
    return undefined
  }
  if (property.key.type === 'Identifier') {
    return property.key.name
  }
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value
  }
  return undefined
}

/** A value with the TypeScript wrappers that change nothing at run time (`as`, `satisfies`, `!`) taken off. */
function unwrapped (node: Node): Node {
  let current = node
  while (current.type === 'TSAsExpression' || current.type === 'TSSatisfiesExpression'
    || current.type === 'TSNonNullExpression') {
    current = current.expression
  }
  return current
}

/**
 * The properties a construct's options literal spells out, as the dotted
 * paths `ContextOptions.spelledOut` takes: every plain `key: value` member,
 * the members of an object value under its key, the members of the one
 * object argument of a call or `new` (a builder such as
 * `RetryStrategyBuilder.linearStrategy({ … })`) under the property's key,
 * and, for an object element of an array with a string `key` property, its
 * members under `<path>[<key>]`. Spreads, computed keys, methods and
 * elements without such a key add nothing, and neither do the arguments of a
 * call with several (`AlertEscalationBuilder.runBasedEscalation(1, { … })`):
 * the codegen could not tell which value they stand for.
 */
export function spelledOutPaths (options: TSESTree.ObjectExpression): Set<string> {
  const paths = new Set<string>()
  const visitValue = (value: Node, path: string): void => {
    const node = unwrapped(value)
    if (node.type === 'ObjectExpression') {
      visitObject(node, path)
    } else if ((node.type === 'CallExpression' || node.type === 'NewExpression') && node.arguments.length === 1) {
      const argument = unwrapped(node.arguments[0])
      if (argument.type === 'ObjectExpression') {
        visitObject(argument, path)
      }
    } else if (node.type === 'ArrayExpression') {
      for (const element of node.elements) {
        const unwrappedElement = element === null ? null : unwrapped(element)
        if (unwrappedElement?.type !== 'ObjectExpression') {
          continue
        }
        const keyProperty = unwrappedElement.properties.find(property => memberName(property) === 'key')
        const key = keyProperty === undefined
          ? undefined
          : stringOf(unwrapped((keyProperty as TSESTree.Property).value))
        if (key !== undefined) {
          visitObject(unwrappedElement, `${path}[${key}]`)
        }
      }
    }
  }
  const visitObject = (object: TSESTree.ObjectExpression, prefix: string): void => {
    for (const property of object.properties) {
      const name = memberName(property)
      if (name === undefined) {
        continue
      }
      const path = prefix === '' ? name : `${prefix}.${name}`
      paths.add(path)
      visitValue((property as TSESTree.Property).value, path)
    }
  }
  visitObject(options, '')
  return paths
}

/**
 * Whether `name` is used as an identifier anywhere in the program: a
 * declaration, an import, a reference, a type name. Member and property
 * names (`x.name`, `{ name: 1 }`) are not identifiers of the name. `walk`
 * yields a parent before its children, so the key or property node to
 * ignore is known by the time it comes up.
 */
/**
 * Whether the program binds `name` at its top level: an import, a variable,
 * function or class declaration. A global such as `Date` that a file binds
 * to something of its own is not the global there.
 */
export function declaresName (program: TSESTree.Program, name: string): boolean {
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration === null || declaration === undefined) {
      continue
    }
    if (declaration.type === 'ImportDeclaration') {
      if (declaration.specifiers.some(specifier => specifier.local.name === name)) {
        return true
      }
    } else if (declaration.type === 'VariableDeclaration') {
      if (declaration.declarations.some(declarator => usesIdentifier(declarator.id, name))) {
        return true
      }
    } else if ((declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration')
      && declaration.id?.name === name) {
      return true
    }
  }
  return false
}

export function usesIdentifier (root: Node, name: string): boolean {
  const ignored = new Set<Node>()
  for (const node of walk(root)) {
    if (node.type === 'MemberExpression' && !node.computed) {
      ignored.add(node.property)
    }
    if ('key' in node && 'computed' in node && node.computed === false) {
      ignored.add(node.key as Node)
    }
    if (node.type === 'Identifier' && node.name === name && !ignored.has(node)) {
      return true
    }
  }
  return false
}
