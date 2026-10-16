import { createRequire } from 'node:module'
import path from 'node:path'

import type { ParseResult, ParserOptions } from 'oxc-parser'

// TypeScript, TSX and JSX parsing with oxc-parser, a native (Rust) parser
// that needs no TypeScript installed and works whatever the project's
// TypeScript version. With `astType: 'ts'` its AST is ESTree with the
// TypeScript nodes `@typescript-eslint/types` describes.

export type ParseSync = (filename: string, source: string, options?: ParserOptions) => ParseResult

let loaded: { parseSync: ParseSync } | { error: unknown } | undefined

/**
 * oxc-parser's `parseSync`. Its native binding can be missing, e.g. when
 * optional dependencies weren't installed or node_modules was copied from
 * another platform; `oxcLoadError` is thrown then, and again on every later
 * call without retrying the load.
 */
export function loadOxcParser (): ParseSync {
  if (loaded === undefined) {
    try {
      const require = createRequire(import.meta.url)
      loaded = { parseSync: require('oxc-parser').parseSync }
    } catch (error) {
      loaded = { error: oxcLoadError(error) }
    }
  }
  if ('error' in loaded) {
    throw loaded.error
  }
  return loaded.parseSync
}

/**
 * A failure to load oxc-parser, named as such: its own error ("Cannot find
 * native binding", with how to reinstall) doesn't say which package it is
 * about.
 */
export function oxcLoadError (error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(`oxc-parser, which parses TypeScript files, failed to load: ${message}`, { cause: error })
}

// foo.d.ts, foo.d.mts, foo.d.cts and foo.d.css.ts (allowArbitraryExtensions)
const DECLARATION_FILE = /\.d\.([^.\\/]+\.)?[cm]?ts$/

function lineColumn (contents: string, offset: number): string {
  const before = contents.slice(0, offset)
  const line = before.split('\n').length
  // 0-based column, like acorn's
  const column = offset - before.lastIndexOf('\n') - 1
  return `${line}:${column}`
}

/**
 * Parses a TypeScript or JSX file the way its extension says: declaration
 * files allow syntax that regular files don't, and JSX is only enabled for
 * `.tsx` and `.jsx`, since in a `.ts` file type brackets would confuse the
 * parser. `.cts` files are CommonJS, the rest modules.
 *
 * @throws SyntaxError on the first syntax error, with its line and column.
 * oxc recovers from syntax errors and returns a partial AST, which is never
 * returned here.
 */
export function parseWithOxc (
  parseSync: ParseSync,
  filePath: string,
  contents: string,
  options: ParserOptions = {},
): ParseResult {
  const extension = path.extname(filePath)
  const result = parseSync(filePath, contents, {
    lang: DECLARATION_FILE.test(filePath)
      ? 'dts'
      : extension === '.tsx' ? 'tsx' : extension === '.jsx' ? 'jsx' : 'ts',
    sourceType: extension === '.cts' ? 'commonjs' : 'module',
    astType: 'ts',
    ...options,
  })
  const [error] = result.errors
  if (error) {
    const offset = error.labels[0]?.start
    throw new SyntaxError(offset === undefined ? error.message : `${error.message} (${lineColumn(contents, offset)})`)
  }
  return result
}
