import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'

import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import { minimatch } from 'minimatch'
// Only import types given this is an optional dependency
import type { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/typescript-estree'
import Debug from 'debug'

import { Collector } from './collector'
import { DependencyParseError } from './errors'
import { PackageFilesResolver, Dependencies, RawDependency, RawDependencySource } from './package-files/resolver'
import type { PlaywrightConfig } from '../playwright-config'
import { findFilesWithPattern, pathToPosix } from '../util'
import { Package, Workspace } from './package-files/workspace'
import { isCoreExtension, isTSExtension } from './package-files/extension'
import { createFauxPackageFiles } from './faux-package'

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

const PACKAGE_EXTENSION = `${path.sep}package.json`

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

let tsParser: any
function getTsParser (): any {
  if (tsParser) {
    return tsParser
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tsParser = require('@typescript-eslint/typescript-estree')
    const AST_NODE_TYPES = tsParser.AST_NODE_TYPES as AST_NODE_TYPES
    // Our custom configuration to handle walking errors

    Object.values(AST_NODE_TYPES).forEach(astType => {
      // Only handle the TS/JSX specific ones
      if (astType.startsWith('TS') || astType.startsWith('JSX')) {
        const base: any = walk.base
        base[astType] = base[astType] ?? ignore
      }
    })
    return tsParser
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      throw new Error('Please install "typescript" to use TypeScript-code in check files')
    }
    throw err
  }
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
export type PhysicalFile = { filePath: string, physical: true }

export type File =
  | VirtualFile
  | PhysicalFile

export class Parser {
  supportedModules: Set<string>
  checkUnsupportedModules: boolean
  workspace?: Workspace
  resolver: PackageFilesResolver
  restricted: boolean
  cache = new Map<string, {
    module: Module
    resolvedDependencies?: Dependencies
    error?: any
  }>()

  // TODO: pass a npm matrix of supported npm modules
  // Maybe pass a cache so we don't have to fetch files separately all the time
  constructor (options: ParserOptions) {
    this.supportedModules = new Set(supportedBuiltinModules.concat(options.supportedNpmModules ?? []))
    this.checkUnsupportedModules = options.checkUnsupportedModules ?? true
    this.workspace = options.workspace
    this.resolver = new PackageFilesResolver({
      workspace: options.workspace,
    })
    this.restricted = options.restricted ?? true
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

  private async validateFile (
    filePath: string,
  ): Promise<FileEntry> {
    debug(`Validating file ${filePath}`)
    const extension = path.extname(filePath)
    if (!this.isProcessableExtension(extension)) {
      throw new Error(`Unsupported file extension for ${filePath}`)
    }
    try {
      const content = await fs.readFile(filePath, { encoding: 'utf-8' })
      return { filePath, content }
    } catch (err) {
      debug(`Failed to validate file ${filePath}: ${err}`)
      throw new DependencyParseError(filePath, [filePath], [], [])
    }
  }

  private isProcessableExtension (extension: string): boolean {
    if (this.restricted) {
      return isLegacySupportedFileExtension(extension)
    }

    if (isCoreExtension(extension) && extension !== '.json') {
      return true
    }

    if (isTSExtension(extension)) {
      return true
    }

    return false
  }

  async getFilesAndDependencies (
    playwrightConfig: PlaywrightConfig,
  ): Promise<{
    files: File[]
    errors: string[]
  }> {
    const files = new Set(await this.getFilesFromPaths(playwrightConfig))
    files.add(playwrightConfig.configFilePath)
    const errors = new Set<string>()
    const missingFiles = new Set<string>()
    const resultFileSet = new Set<string>()
    const neighbors = new NeighborDependencyCollector()
    for (const file of files) {
      if (resultFileSet.has(file)) {
        continue
      }
      const extension = path.extname(file)
      if (!this.isProcessableExtension(extension)) {
        resultFileSet.add(file)
        continue
      }
      const item = await this.validateFile(file)

      const cache = this.cache.get(item.filePath)
      const { module, error } = cache !== undefined
        ? cache
        : Parser.parseDependencies(item.filePath, item.content)

      if (error) {
        this.cache.set(item.filePath, { module, error })
        errors.add(item.filePath)
        continue
      }
      const resolvedDependencies = cache?.resolvedDependencies
        ?? await this.resolver.resolveDependenciesForFilePath(item.filePath, module.dependencies)

      for (const dep of resolvedDependencies.missing) {
        missingFiles.add(pathToPosix(dep.filePath))
      }

      neighbors.markDepended(...resolvedDependencies.neighbors.depends)
      neighbors.markReferenced(...resolvedDependencies.neighbors.references)

      this.cache.set(item.filePath, { module, resolvedDependencies })

      for (const dep of resolvedDependencies.local) {
        if (resultFileSet.has(dep.sourceFile.meta.filePath)) {
          continue
        }
        const filePath = dep.sourceFile.meta.filePath
        files.add(filePath)
      }
      resultFileSet.add(pathToPosix(item.filePath))
    }

    if (missingFiles.size) {
      throw new DependencyParseError([].join(', '), Array.from(missingFiles), [], [])
    }

    const outputFiles: File[] = []

    for (const filePath of resultFileSet) {
      outputFiles.push({
        filePath,
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

  private async collectFiles (cache: Map<string, string[]>, testDir: string, ignoredFiles: string[]) {
    let files = cache.get(testDir)
    if (!files) {
      files = await findFilesWithPattern(testDir, '**/*.{js,ts,mjs}', ignoredFiles)
      cache.set(testDir, files)
    }
    return files
  }

  private async getFilesFromPaths (playwrightConfig: (PlaywrightConfig)): Promise<string[]> {
    const ignoredFiles = ['**/node_modules/**', '.git/**']
    const cachedFiles = new Map<string, string[]>()
    // If projects is definited, ignore root settings
    const projects = playwrightConfig.projects ?? [playwrightConfig]
    for (const project of projects) {
      // Cache the files by test dir
      const files = await this.collectFiles(cachedFiles, project.testDir, ignoredFiles)
      const matcher = this.createFileMatcher(Array.from(project.testMatch))
      for (const file of files) {
        if (!matcher(file)) {
          continue
        }
        project.addFiles(file)
        const snapshotGlobs = project.getSnapshotPath(file).map(snapshotPath => pathToPosix(snapshotPath))
        const snapshots = await findFilesWithPattern(project.testDir, snapshotGlobs, ignoredFiles)
        if (snapshots.length) {
          project.addFiles(...snapshots)
        }
      }
    }
    return playwrightConfig.getFiles()
  }

  createFileMatcher (patterns: (string | RegExp)[]): (filePath: string) => boolean {
    const reList: RegExp[] = []
    const filePatterns: string[] = []
    for (const pattern of patterns) {
      if (pattern instanceof RegExp) {
        reList.push(pattern)
      } else {
        if (!pattern.startsWith('**/')) {
          filePatterns.push('**/' + pattern)
        } else {
          filePatterns.push(pattern)
        }
      }
    }
    return (filePath: string) => {
      for (const re of reList) {
        re.lastIndex = 0
        if (re.test(filePath)) {
          return true
        }
      }
      // Windows might still receive unix style paths from Cygwin or Git Bash.
      // Check against the file url as well.
      if (path.sep === '\\') {
        const fileURL = url.pathToFileURL(filePath).href
        for (const re of reList) {
          re.lastIndex = 0
          if (re.test(fileURL)) {
            return true
          }
        }
      }
      for (const pattern of filePatterns) {
        if (minimatch(filePath, pattern, { nocase: true, dot: true })) {
          return true
        }
      }
      return false
    }
  }

  async parse (entrypoint: string) {
    const { content } = await this.validateFile(entrypoint)

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

      if (item.filePath.endsWith(PACKAGE_EXTENSION)) {
        // Holds info about the main file and doesn't need to be parsed
        continue
      }

      // This cache is only useful when there are multiple entrypoints with
      // common files, as we make sure to not add the same file twice to
      // bfsQueue.
      const cache = this.cache.get(item.filePath)
      const { module, error } = cache !== undefined
        ? cache
        : Parser.parseDependencies(item.filePath, item.content)

      if (error) {
        this.cache.set(item.filePath, { module, error })
        collector.addParsingError(item.filePath, error.message)
        continue
      }

      const resolvedDependencies = cache?.resolvedDependencies
        ?? await this.resolver.resolveDependenciesForFilePath(item.filePath, module.dependencies)

      this.cache.set(item.filePath, { module, resolvedDependencies })

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

    for (const pkg of neighbors.unreferencedDependedPackages()) {
      for (const f of createFauxPackageFiles(pkg)) {
        collector.addDependency(f.filePath, f.content)
      }
    }

    collector.validate()

    return collector.getItems()
  }

  static parseDependencies (filePath: string, contents: string):
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
        const tsParser = getTsParser()
        const ast = tsParser.parse(contents, {
          // We must only enable jsx for tsx/jsx files. Otherwise type brackets
          // may confuse the parser and cause an error.
          jsx: extension.endsWith('x'),
        })
        // The AST from typescript-estree is slightly different from the type used by acorn-walk.
        // This doesn't actually cause problems (both are "ESTree's"), but we need to ignore type errors here.
        // @ts-ignore
        walk.simple(ast, Parser.tsNodeVisitor(tsParser, dependencies))
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

  static tsNodeVisitor (tsParser: any, dependencies: RawDependencyCollector): any {
    return {
      // While rare, TypeScript files may also use require.
      CallExpression (node: Node) {
        if (!Parser.isRequireExpression(node)) return
        const requireStringArg = Parser.getRequireStringArg(node)
        Parser.registerDependency(requireStringArg, 'require', dependencies)
      },
      ImportDeclaration (node: TSESTree.ImportDeclaration) {
      // For now, we only support literal strings in the import statement
        if (node.source.type !== tsParser.TSESTree.AST_NODE_TYPES.Literal) return
        Parser.registerDependency(node.source.value, 'import', dependencies)
      },
      ExportNamedDeclaration (node: TSESTree.ExportNamedDeclaration) {
      // The statement isn't importing another dependency
        if (node.source === null) return
        // For now, we only support literal strings in the export statement
        if (node.source.type !== tsParser.TSESTree.AST_NODE_TYPES.Literal) return
        Parser.registerDependency(node.source.value, 'import', dependencies)
      },
      ExportAllDeclaration (node: TSESTree.ExportAllDeclaration) {
        if (node.source === null) return
        // For now, we only support literal strings in the export statement
        if (node.source.type !== tsParser.TSESTree.AST_NODE_TYPES.Literal) return
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
