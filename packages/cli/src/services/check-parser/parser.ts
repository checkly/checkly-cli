import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import type { ParseResult, ParserOptions as OxcParserOptions } from 'oxc-parser'
import Debug from 'debug'

import { Collector } from './collector.js'
import { DependencyParseError } from './errors.js'
import { PackageFilesResolver, Dependencies, RawDependency, RawDependencySource } from './package-files/resolver.js'
import type { PlaywrightConfig } from '../playwright-config.js'
import { pathToPosix } from '../util.js'
import { Package, Workspace } from './package-files/workspace.js'
import { isCoreExtension, isTSExtension } from './package-files/extension.js'
import { createFauxPackageFiles } from './faux-package.js'
import { isPnpmfilePath } from './package-files/pnpmfile.js'
import { PlaywrightConfigExpander } from './playwright-config-expander.js'

const debug = Debug('checkly:cli:services:check-parser:parser')

// Our custom configuration to handle walking errors

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ignore = (_node: any, _st: any, _c: any) => {}

type Module = {
  dependencies: Array<RawDependency>
}

type LegacySupportedFileExtension = '.js' | '.mjs' | '.ts'

function isLegacySupportedFileExtension (value: string): value is LegacySupportedFileExtension {
  switch (value) {
    case '.js':
    case '.mjs':
    case '.ts':
      return true
    default:
      return false
  }
}

const supportedBuiltinModules = [
  'node:assert',
  'node:buffer',
  'node:crypto',
  'node:dns',
  'node:fs',
  'node:path',
  'node:querystring',
  'node:readline',
  'node:stream',
  'node:string_decoder',
  'node:timers',
  'node:tls',
  'node:url',
  'node:util',
  'node:zlib',
]

export type TsParse = (filePath: string, contents: string) => unknown

// acorn-walk doesn't know the TypeScript and JSX node types. TS/JSX nodes are
// skipped, so dependencies inside type positions or JSX aren't collected.
// Auto-accessor class fields (`accessor x = ...`) have the same shape as
// regular class fields, so their computed key and initializer are walked for
// dependencies.
const tsWalkBase = new Proxy(walk.base, {
  get (base: any, type: string | symbol) {
    if (typeof type === 'string' && !(type in base)) {
      if (type === 'AccessorProperty') {
        return base.PropertyDefinition
      }
      if (type.startsWith('TS') || type.startsWith('JSX')) {
        return ignore
      }
    }
    return base[type]
  },
})

// foo.d.ts, foo.d.mts, foo.d.cts and foo.d.css.ts (allowArbitraryExtensions)
const DECLARATION_FILE = /\.d\.([^.\\/]+\.)?[cm]?ts$/

function lineColumn (contents: string, offset: number): string {
  const before = contents.slice(0, offset)
  const line = before.split('\n').length
  // 0-based column, like acorn's
  const column = offset - before.lastIndexOf('\n') - 1
  return `${line}:${column}`
}

function oxcParse (parseSync: (filename: string, source: string, options?: OxcParserOptions) => ParseResult): TsParse {
  return (filePath, contents) => {
    const extension = path.extname(filePath)
    const result = parseSync(filePath, contents, {
      // Declaration files allow syntax that regular files don't. We must only
      // enable jsx for tsx files. Otherwise type brackets may confuse the
      // parser and cause an error.
      lang: DECLARATION_FILE.test(filePath) ? 'dts' : extension === '.tsx' ? 'tsx' : 'ts',
      sourceType: extension === '.cts' ? 'commonjs' : 'module',
      astType: 'ts',
    })
    // oxc recovers from syntax errors and returns a partial AST. Treat any
    // error as a failure so a broken file doesn't yield partial dependencies.
    const [error] = result.errors
    if (error) {
      const offset = error.labels[0]?.start
      throw new SyntaxError(offset === undefined ? error.message : `${error.message} (${lineColumn(contents, offset)})`)
    }
    return result.program
  }
}

export function typescriptEstreeParse (): TsParse {
  try {
    const require = createRequire(import.meta.url)
    const tsParser = require('@typescript-eslint/typescript-estree')
    return (filePath, contents) => tsParser.parse(contents, {
      // We must only enable jsx for tsx/jsx files. Otherwise type brackets
      // may confuse the parser and cause an error.
      jsx: path.extname(filePath).endsWith('x'),
    })
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      throw new Error('Please install "typescript" to use TypeScript-code in check files', { cause: err })
    }
    throw err
  }
}

// typescript-estree only supports the TypeScript versions it was built for,
// and only loads when TypeScript is installed. When it fails while standing in
// for oxc-parser, oxc-parser failing to load is the root cause, so the error
// names both. Syntax errors in the parsed file are passed through as they are.
export function typescriptEstreeFallback (oxcError: unknown, load = typescriptEstreeParse): TsParse {
  const message = (err: unknown) => err instanceof Error ? err.message : String(err)
  const explain = (err: unknown) => new Error(
    `${message(err)} (typescript-estree was used because oxc-parser failed to load: ${message(oxcError)})`,
    { cause: err },
  )

  let parse: TsParse
  try {
    parse = load()
  } catch (err) {
    return () => {
      throw explain(err)
    }
  }
  return (filePath, contents) => {
    try {
      return parse(filePath, contents)
    } catch (err: any) {
      if (err?.name === 'TSError') {
        throw err
      }
      throw explain(err)
    }
  }
}

let tsParse: TsParse | undefined
function getTsParse (): TsParse {
  if (tsParse) {
    return tsParse
  }

  try {
    // oxc-parser is a native (Rust) parser. It's much faster than
    // typescript-estree, doesn't depend on the user's TypeScript version, and
    // works without TypeScript installed.
    const require = createRequire(import.meta.url)
    tsParse = oxcParse(require('oxc-parser').parseSync)
  } catch (err) {
    // Its native binding can be missing, e.g. when optional dependencies
    // weren't installed or node_modules was copied from another platform.
    debug(`Failed to load oxc-parser, falling back to typescript-estree: ${err}`)
    tsParse = typescriptEstreeFallback(err)
  }
  return tsParse
}

class RawDependencyCollector {
  #dependencies: RawDependency[] = []

  add (dependency: RawDependency) {
    this.#dependencies.push(dependency)
  }

  state (): RawDependency[] {
    return this.#dependencies
  }
}

class NeighborDependencyCollector {
  #depended = new Set<Package>()
  #referenced = new Set<Package>()

  markDepended (...pkg: Package[]): void {
    for (const p of pkg) {
      this.#depended.add(p)
    }
  }

  markReferenced (...pkg: Package[]): void {
    for (const p of pkg) {
      this.markDepended(p)
      this.#referenced.add(p)
    }
  }

  unreferencedDependedPackages (): Package[] {
    return Array.from(this.#depended).filter(pkg => !this.#referenced.has(pkg))
  }
}

type FileEntry = {
  filePath: string
  content: string
}

type ParserOptions = {
  supportedNpmModules?: Array<string>
  checkUnsupportedModules?: boolean
  workspace?: Workspace
  restricted?: boolean
}

export type VirtualFile = { filePath: string, physical: false, content: string }
export type PhysicalFile = {
  filePath: string
  physical: true
  /**
   * Where the file goes in the archive. Defaults to filePath relative to the
   * bundle root. Only needed when the two differ, which happens when a file is
   * bundled at the path of a symlink that points at it.
   */
  archivePath?: string
  /**
   * When set, the entry is archived as a symlink pointing here rather than as a
   * copy of the file's contents. Relative to the entry's own archive directory.
   */
  symlinkTarget?: string
  /**
   * Marks a symlink entry that a bundled file's own path references depend on
   * (e.g. a Playwright config's testDir spelled through the link). If such a
   * link cannot make it into the archive, those references break at run time —
   * dropping it deserves a warning, not just a debug line.
   */
  referencedLink?: true
}

export type File =
  | VirtualFile
  | PhysicalFile

const FILEOP_PARSE = 1
const FILEOP_RESOLVE = 2

export class Parser {
  supportedModules: Set<string>
  checkUnsupportedModules: boolean
  workspace?: Workspace
  resolver: PackageFilesResolver
  restricted: boolean

  #parseCache = new Map<string, Promise<{
    module: Module
    error?: any
  }>>()

  #resolveCache = new Map<string, Promise<Dependencies>>()

  #configExpander = new PlaywrightConfigExpander()

  // TODO: pass a npm matrix of supported npm modules
  // Maybe pass a cache so we don't have to fetch files separately all the time
  constructor (options: ParserOptions) {
    this.restricted = options.restricted ?? true
    this.supportedModules = new Set(supportedBuiltinModules.concat(options.supportedNpmModules ?? []))
    this.checkUnsupportedModules = options.checkUnsupportedModules ?? true
    this.workspace = options.workspace
    this.resolver = new PackageFilesResolver({
      workspace: options.workspace,
      restricted: this.restricted,
    })
  }

  supportsModule (importPath: string) {
    if (this.supportedModules.has(importPath)) {
      return true
    }

    if (this.supportedModules.has('node:' + importPath)) {
      return true
    }

    return false
  }

  private validateEntrypoint (
    filePath: string,
  ): void {
    const ops = this.determineFileOps(filePath)
    if ((ops & FILEOP_PARSE) === 0) {
      throw new Error(`Unsupported file extension for ${filePath}`)
    }
  }

  private async readFile (
    filePath: string,
  ): Promise<FileEntry> {
    debug(`Reading file ${filePath}`)
    try {
      const content = await fs.readFile(filePath, { encoding: 'utf-8' })
      return { filePath, content }
    } catch (err) {
      debug(`Failed to read file ${filePath}: ${err}`)
      throw new DependencyParseError(filePath, [filePath], [], [])
    }
  }

  private determineFileOps (filePath: string): number {
    const extension = path.extname(filePath)

    // Pnpmfiles are pnpm install-time configuration, not check code: they are
    // bundled verbatim and must never be parsed. Parsing would treat their
    // require/import statements as check dependencies, and e.g. an optional
    // `try { require(...) } catch {}` of a gitignored file would fail the
    // whole bundle as a missing dependency.
    if (isPnpmfilePath(filePath)) {
      return 0
    }

    if (this.restricted) {
      if (isLegacySupportedFileExtension(extension)) {
        return FILEOP_RESOLVE | FILEOP_PARSE
      }

      return 0
    }

    if (isCoreExtension(extension)) {
      if (extension === '.json') {
        return FILEOP_RESOLVE
      }

      return FILEOP_RESOLVE | FILEOP_PARSE
    }

    if (isTSExtension(extension)) {
      return FILEOP_RESOLVE | FILEOP_PARSE
    }

    return 0
  }

  async getFilesAndDependencies (
    playwrightConfig: PlaywrightConfig,
  ): Promise<{
    files: File[]
    errors: string[]
  }> {
    // The result includes the config file itself; the expander seeds it, so it
    // goes through the same root-spelling reconciliation as everything else.
    const files = new Set(await this.#configExpander.findTestFiles(playwrightConfig, {
      // The workspace root doubles as the bundle root (the Bundler's strip
      // prefix); discovered paths must be spelled relative to it or their
      // archive names go wrong. Without a workspace there is no bundle root and
      // paths pass through as discovered.
      bundleRoot: this.workspace?.root.path,
    }))
    const errors = new Set<string>()
    const missingFiles = new Set<string>()
    const resultFileSet = new Set<string>()
    const neighbors = new NeighborDependencyCollector()
    for (const filePath of files) {
      if (resultFileSet.has(filePath)) {
        continue
      }

      const ops = this.determineFileOps(filePath)

      // Not necessary - just a minor optimization.
      if (ops === 0) {
        resultFileSet.add(filePath)
        continue
      }

      let dependencies: RawDependency[] = []
      if (ops & FILEOP_PARSE) {
        const { module, error } = await this.parseFile(filePath)

        if (error) {
          errors.add(filePath)
          continue
        }

        dependencies = module.dependencies
      }

      if (ops & FILEOP_RESOLVE) {
        const resolvedDependencies = await this.resolveDependencies(filePath, dependencies)

        for (const dep of resolvedDependencies.missing) {
          missingFiles.add(dep.filePath)
        }

        neighbors.markDepended(...resolvedDependencies.neighbors.depends)
        neighbors.markReferenced(...resolvedDependencies.neighbors.references)

        for (const dep of resolvedDependencies.local) {
          if (resultFileSet.has(dep.sourceFile.meta.filePath)) {
            continue
          }
          const filePath = dep.sourceFile.meta.filePath
          files.add(filePath)
        }
      }

      resultFileSet.add(filePath)
    }

    if (missingFiles.size) {
      throw new DependencyParseError([].join(', '), Array.from(missingFiles), [], [])
    }

    const outputFiles: File[] = []

    for (const filePath of resultFileSet) {
      outputFiles.push({
        filePath: pathToPosix(filePath),
        physical: true,
      })
    }

    const neighborFiles = neighbors.unreferencedDependedPackages()
      .flatMap(pkg => createFauxPackageFiles(pkg))

    outputFiles.push(...neighborFiles)

    outputFiles.sort((a, b) => {
      return a.filePath.localeCompare(b.filePath)
    })

    return {
      files: outputFiles,
      errors: Array.from(errors),
    }
  }

  private async parseFile (
    filePath: string,
  ): Promise<{ module: Module, error?: any }> {
    const cached = this.#parseCache.get(filePath)
    if (cached !== undefined) {
      return await cached
    }
    // Cache the in-flight read+parse promise (not the resolved value) so that
    // when many checks resolve the same shared file concurrently they share a
    // single read and a single AST instead of each allocating its own.
    const promise = this.readFile(filePath)
      .then(({ content }) => Parser.parseDependencies(filePath, content))
    this.#parseCache.set(filePath, promise)
    return await promise
  }

  private async parseFileContent (
    filePath: string,
    content: string,
  ): Promise<{ module: Module, error?: any }> {
    const cached = this.#parseCache.get(filePath)
    if (cached !== undefined) {
      return await cached
    }
    // The content is already in hand, so parse synchronously, but cache the
    // result as a promise to share the same #parseCache with parseFile.
    const promise = Promise.resolve(Parser.parseDependencies(filePath, content))
    this.#parseCache.set(filePath, promise)
    return await promise
  }

  private async resolveDependencies (
    filePath: string,
    dependencies: RawDependency[],
  ): Promise<Dependencies> {
    const cached = this.#resolveCache.get(filePath)
    if (cached !== undefined) {
      return await cached
    }
    // Cache the in-flight promise so concurrent callers for the same file
    // share a single dependency resolution instead of each walking the whole
    // tree and allocating a separate result.
    const promise = this.resolver.resolveDependenciesForFilePath(filePath, dependencies)
    this.#resolveCache.set(filePath, promise)
    return await promise
  }

  async parse (entrypoint: string) {
    this.validateEntrypoint(entrypoint)

    const { content } = await this.readFile(entrypoint)

    /*
  * The importing of files forms a directed graph.
  * Vertices are source files and edges are from importing other files.
  * We can find all of the files we need to run the check by traversing this graph.
  * In this implementation, we use breadth first search.
  */
    const collector = new Collector(entrypoint, content)
    const neighbors = new NeighborDependencyCollector()
    const bfsQueue: [FileEntry] = [{ filePath: entrypoint, content }]
    while (bfsQueue.length > 0) {
      // Since we just checked the length, shift() will never return undefined.
      // We can add a not-null assertion operator (!).
      const item = bfsQueue.shift()!

      const ops = this.determineFileOps(item.filePath)

      // Not necessary - just a minor optimization.
      if (ops === 0) {
        continue
      }

      let dependencies: RawDependency[] = []
      if (ops & FILEOP_PARSE) {
        const { module, error } = await this.parseFileContent(item.filePath, item.content)

        if (error) {
          collector.addParsingError(item.filePath, error.message)
          continue
        }

        dependencies = module.dependencies
      }

      if (ops & FILEOP_RESOLVE) {
        const resolvedDependencies = await this.resolveDependencies(item.filePath, dependencies)

        if (this.checkUnsupportedModules) {
          const unsupportedDependencies = resolvedDependencies.external.flatMap(dep => {
            if (!this.supportsModule(dep.importPath)) {
              return [dep.importPath]
            } else {
              return []
            }
          })
          if (unsupportedDependencies.length) {
            collector.addUnsupportedNpmDependencies(item.filePath, unsupportedDependencies)
          }
        }

        for (const dep of resolvedDependencies.missing) {
          collector.addMissingFile(dep.filePath)
        }

        for (const dep of resolvedDependencies.local) {
          const filePath = dep.sourceFile.meta.filePath
          if (collector.hasDependency(filePath)) {
            continue
          }
          collector.addDependency(filePath, dep.sourceFile.contents)
          bfsQueue.push({ filePath, content: dep.sourceFile.contents })
        }

        neighbors.markDepended(...resolvedDependencies.neighbors.depends)
        neighbors.markReferenced(...resolvedDependencies.neighbors.references)
      }
    }

    for (const pkg of neighbors.unreferencedDependedPackages()) {
      for (const f of createFauxPackageFiles(pkg)) {
        collector.addDependency(f.filePath, f.content)
      }
    }

    collector.validate()

    return collector.getItems()
  }

  static parseDependencies (filePath: string, contents: string, tsParse?: TsParse):
  { module: Module, error?: any } {
    debug(`Parsing dependencies of ${filePath}`)
    const dependencies = new RawDependencyCollector()

    const extension = path.extname(filePath)
    try {
      if (isCoreExtension(extension) && extension !== '.json') {
        const ast = acorn.parse(contents, {
          allowReturnOutsideFunction: true,
          ecmaVersion: 'latest',
          allowImportExportEverywhere: true,
          allowAwaitOutsideFunction: true,
        })
        walk.simple(ast, Parser.jsNodeVisitor(dependencies))
      } else if (isTSExtension(extension)) {
        const ast = (tsParse ?? getTsParse())(filePath, contents)
        // The TypeScript AST is a superset of the ESTree acorn-walk expects.
        walk.simple(ast as acorn.Node, Parser.tsNodeVisitor(dependencies), tsWalkBase)
      }
    } catch (err) {
      debug(`Failed to parse dependencies of ${filePath}: ${err}`)

      return {
        module: {
          dependencies: dependencies.state(),
        },
        error: err,
      }
    }

    return {
      module: {
        dependencies: dependencies.state(),
      },
    }
  }

  static jsNodeVisitor (dependencies: RawDependencyCollector): any {
    return {
      CallExpression (node: Node) {
        if (!Parser.isRequireExpression(node)) return
        const requireStringArg = Parser.getRequireStringArg(node)
        Parser.registerDependency(requireStringArg, 'require', dependencies)
      },
      ImportDeclaration (node: any) {
        if (node.source.type !== 'Literal') return
        Parser.registerDependency(node.source.value, 'import', dependencies)
      },
      ExportNamedDeclaration (node: any) {
        if (node.source === null) return
        if (node.source.type !== 'Literal') return
        Parser.registerDependency(node.source.value, 'import', dependencies)
      },
      ExportAllDeclaration (node: any) {
        if (node.source === null) return
        if (node.source.type !== 'Literal') return
        Parser.registerDependency(node.source.value, 'import', dependencies)
      },
    }
  }

  static tsNodeVisitor (dependencies: RawDependencyCollector): any {
    return {
      // While rare, TypeScript files may also use require.
      CallExpression (node: Node) {
        if (!Parser.isRequireExpression(node)) return
        const requireStringArg = Parser.getRequireStringArg(node)
        Parser.registerDependency(requireStringArg, 'require', dependencies)
      },
      ImportDeclaration (node: any) {
      // For now, we only support literal strings in the import statement
        if (node.source.type !== 'Literal') return
        Parser.registerDependency(node.source.value, 'import', dependencies)
      },
      ExportNamedDeclaration (node: any) {
      // The statement isn't importing another dependency
        if (node.source === null) return
        // For now, we only support literal strings in the export statement
        if (node.source.type !== 'Literal') return
        Parser.registerDependency(node.source.value, 'import', dependencies)
      },
      ExportAllDeclaration (node: any) {
        if (node.source === null) return
        // For now, we only support literal strings in the export statement
        if (node.source.type !== 'Literal') return
        Parser.registerDependency(node.source.value, 'import', dependencies)
      },
    }
  }

  static isRequireExpression (node: any): boolean {
    if (node.type !== 'CallExpression') {
    // Ignore AST nodes that aren't call expressions
      return false
    } else if (node.arguments.length === 0) {
    // Weird case of `require()` or `module.require()` without arguments
      return false
    } else if (node.callee.type === 'Identifier') {
    // Handle the case of a simple call to `require('dependency')`
      return node.callee.name === 'require'
    } else if (node.callee.type === 'MemberExpression') {
    // Handle calls to `module.require('dependency')`
      const { object, property } = node.callee
      return object.type === 'Identifier'
        && object.name === 'module'
        && property.type === 'Identifier'
        && property.name === 'require'
    } else {
      return false
    }
  }

  static getRequireStringArg (node: any): string | null {
    if (node.arguments[0].type === 'Literal') {
      return node.arguments[0].value
    } else if (node.arguments[0].type === 'TemplateLiteral') {
      return node.arguments[0].quasis[0].value.cooked
    } else {
    /*
    * It might be that `require` is called with a variable - `require(myPackage)`.
    * Unfortunately supporting that case would be complicated.
    * We just skip the dependency and hope that the check still works.
    */
      return null
    }
  }

  static registerDependency (
    importPath: string | null,
    source: RawDependencySource,
    dependencies: RawDependencyCollector,
  ) {
    if (!importPath) {
      // If there's no importPath, don't register a dependency.
      return
    }

    dependencies.add({
      importPath,
      source,
    })
  }
}
