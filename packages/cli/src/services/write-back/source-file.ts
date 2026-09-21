import path from 'node:path'
import { createRequire } from 'node:module'
import * as acorn from 'acorn'
import type { TSESTree } from '@typescript-eslint/typescript-estree'

/**
 * Reads a construct's source file far enough to find the `new X('id', { … })`
 * that declared it, so `literal-edit.ts` can splice values into that options
 * object by byte range.
 *
 * Two parsers, one AST shape: `.js`/`.mjs`/`.cjs` go through acorn, which the
 * CLI always ships; TypeScript and JSX go through typescript-estree, which
 * needs the project's own `typescript` — the same requirement the check
 * dependency parser already places on TypeScript check files. Both produce
 * ESTree nodes carrying `range`, and only `range` and the node types below are
 * read. Recast (which edits `checkly.config.ts` elsewhere in the CLI) is not
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
 * A parsed file with its tokens and comments, which the splicer needs to
 * tell a comma of the source from one inside a comment.
 */
export interface ParsedSource {
  /** The text the program was parsed from; every range below indexes it. */
  text: string
  program: TSESTree.Program
  tokens: SourceToken[]
}

const CHECKLY_MODULE = /^checkly(\/.*)?$/

let tsParser: typeof import('@typescript-eslint/typescript-estree') | undefined

function loadTsParser (): typeof import('@typescript-eslint/typescript-estree') {
  if (tsParser !== undefined) {
    return tsParser
  }
  try {
    const require = createRequire(import.meta.url)
    tsParser = require('@typescript-eslint/typescript-estree')
    return tsParser as typeof import('@typescript-eslint/typescript-estree')
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      throw new WriteBackSkipped('install "typescript" in the project to update TypeScript and JSX files')
    }
    throw err
  }
}

export function parseSource (filePath: string, text: string): ParsedSource {
  const extension = path.extname(filePath)
  if (!SOURCE_EXTENSIONS.has(extension)) {
    throw new WriteBackSkipped(`${extension === '' ? 'the file' : `"${extension}"`} is not a JavaScript or TypeScript file`)
  }
  try {
    if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
      const tokens: SourceToken[] = []
      // The same options the check dependency parser reads .js files with,
      // so the two agree on what parses.
      const program = acorn.parse(text, {
        ecmaVersion: 'latest',
        ranges: true,
        allowHashBang: true,
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        onToken: token => {
          if (token.type.label !== 'eof') {
            tokens.push({ kind: 'token', value: text.slice(token.start, token.end), range: [token.start, token.end] })
          }
        },
        onComment: (_block, _text, start, end) => tokens.push({ kind: 'comment', value: '', range: [start, end] }),
      }) as unknown as TSESTree.Program
      return { text, program, tokens: tokens.sort((a, b) => a.range[0] - b.range[0]) }
    }
    const program = loadTsParser().parse(text, {
      range: true,
      comment: true,
      tokens: true,
      jsx: extension.endsWith('x'),
    })
    const tokens: SourceToken[] = [
      ...(program.tokens ?? []).map((token): SourceToken => ({ kind: 'token', value: token.value, range: token.range })),
      ...(program.comments ?? []).map((comment): SourceToken => ({ kind: 'comment', value: '', range: comment.range })),
    ]
    return { text, program, tokens: tokens.sort((a, b) => a.range[0] - b.range[0]) }
  } catch (err: any) {
    if (err instanceof WriteBackSkipped) {
      throw err
    }
    throw new WriteBackSkipped(`could not parse the file: ${err.message}`)
  }
}

/** Every node below (and including) `root`, in source order. Only object-valued keys are followed, which covers every ESTree child slot. */
export function* walk (root: Node): Generator<Node> {
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const node = stack.pop() as Node
    yield node
    const children: Node[] = []
    for (const [key, value] of Object.entries(node)) {
      // `parent` would cycle; a program's token and comment lists are not
      // part of the tree.
      if (key === 'parent' || key === 'tokens' || key === 'comments') {
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
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i])
    }
  }
}

function isNode (value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

/** The string a literal argument spells, for a plain string literal or a template with no `${}` in it. */
function stringOf (node: Node | null | undefined): string | undefined {
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
 * that merely shares the name. Scope is not tracked: a local that shadows
 * the import inside a function is taken for it, which the logical id and
 * the later read-back of the edit bound.
 */
function checklyBindings (program: TSESTree.Program, exportedNames: ReadonlySet<string>): Set<string> {
  const locals = new Set<string>()
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      if (typeof statement.source.value !== 'string' || !CHECKLY_MODULE.test(statement.source.value)) {
        continue
      }
      for (const specifier of statement.specifiers) {
        if (specifier.type !== 'ImportSpecifier') {
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

function isChecklyRequire (node: Node | null | undefined): boolean {
  return node !== null && node !== undefined
    && node.type === 'CallExpression'
    && node.callee.type === 'Identifier' && node.callee.name === 'require'
    && node.arguments.length === 1
    && CHECKLY_MODULE.test(stringOf(node.arguments[0]) ?? '')
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
    if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && locals.has(node.callee.name)
      && stringOf(node.arguments[0]) === logicalId) {
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
