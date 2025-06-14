import fs from 'node:fs/promises'
import path, { resolve } from 'node:path'
import url from 'node:url'

import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import { minimatch } from 'minimatch'
// Only import types given this is an optional dependency
import type { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/typescript-estree'

import { Collector } from './collector'
import { DependencyParseError } from './errors'
import { PackageFilesResolver, Dependencies } from './package-files/resolver'
import type { PlaywrightConfig } from '../playwright-config'
import { findFilesWithPattern, pathToPosix } from '../util'

// Our custom configuration to handle walking errors

const ignore = (_node: any, _st: any, _c: any) => {}

type Module = {
  dependencies: Array<string>,
}

type SupportedFileExtension = '.js' | '.mjs' | '.ts'

const PACKAGE_EXTENSION = `${path.sep}package.json`
const STATIC_FILE_EXTENSION = ['.json', '.txt', '.jpeg', '.jpg', '.png']

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

async function validateEntrypoint (entrypoint: string): Promise<{extension: SupportedFileExtension, content: string}> {
  const extension = path.extname(entrypoint)
  if (extension !== '.js' && extension !== '.ts' && extension !== '.mjs') {
    throw new Error(`Unsupported file extension for ${entrypoint}`)
  }
  try {
    const content = await fs.readFile(entrypoint, { encoding: 'utf-8' })
    return { extension, content }
  } catch {
    throw new DependencyParseError(entrypoint, [entrypoint], [], [])
  }
}

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

    Object.values(AST_NODE_TYPES).forEach((astType) => {
      // Only handle the TS specific ones
      if (!astType.startsWith('TS')) {
        return
      }
      const base: any = walk.base
      base[astType] = base[astType] ?? ignore
    })
    return tsParser
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      throw new Error('Please install "typescript" to use TypeScript-code in check files')
    }
    throw err
  }
}

type ParserOptions = {
  supportedNpmModules?: Array<string>
  checkUnsupportedModules?: boolean
}

export class Parser {
  supportedModules: Set<string>
  checkUnsupportedModules: boolean
  resolver = new PackageFilesResolver()
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

  private async validateFile (filePath: string): Promise<{ filePath: string, content: string }> {
    const extension = path.extname(filePath)
    if (extension !== '.js' && extension !== '.ts' && extension !== '.mjs') {
      throw new Error(`Unsupported file extension for ${filePath}`)
    }
    try {
      const content = await fs.readFile(filePath, { encoding: 'utf-8' })
      return { filePath, content }
    } catch {
      throw new DependencyParseError(filePath, [filePath], [], [])
    }
  }

  async getFilesAndDependencies (playwrightConfig: PlaywrightConfig):
    Promise<{ files: string[], errors: string[] }> {
    const files = new Set(await this.getFilesFromPaths(playwrightConfig))
    files.add(playwrightConfig.configFilePath)
    const errors = new Set<string>()
    const missingFiles = new Set<string>()
    const resultFileSet = new Set<string>()
    for (const file of files) {
      if (resultFileSet.has(file)) {
        continue
      }
      if (STATIC_FILE_EXTENSION.includes(path.extname(file))) {
        // Holds info about the main file and doesn't need to be parsed
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
      const resolvedDependencies = cache?.resolvedDependencies ??
        await this.resolver.resolveDependenciesForFilePath(item.filePath, module.dependencies)

      for (const dep of resolvedDependencies.missing) {
        missingFiles.add(pathToPosix(dep.filePath))
      }

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
    return { files: Array.from(resultFileSet), errors: Array.from(errors) }
  }

  private async collectFiles(cache: Map<string, string[]>, testDir: string, ignoredFiles: string[]) {
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

  createFileMatcher(patterns: (string | RegExp)[]): (filePath: string) => boolean {
    const reList: RegExp[] = [];
    const filePatterns: string[] = [];
    for (const pattern of patterns) {
      if (pattern instanceof RegExp) {
        reList.push(pattern);
      } else {
        if (!pattern.startsWith('**/'))
          filePatterns.push('**/' + pattern);
        else
          filePatterns.push(pattern);
      }
    }
    return (filePath: string) => {
      for (const re of reList) {
        re.lastIndex = 0;
        if (re.test(filePath))
          return true;
      }
      // Windows might still receive unix style paths from Cygwin or Git Bash.
      // Check against the file url as well.
      if (path.sep === '\\') {
        const fileURL = url.pathToFileURL(filePath).href;
        for (const re of reList) {
          re.lastIndex = 0;
          if (re.test(fileURL))
            return true;
        }
      }
      for (const pattern of filePatterns) {
        if (minimatch(filePath, pattern, { nocase: true, dot: true }))
          return true;
      }
      return false;
    }
  }

  async parse (entrypoint: string) {
    const { content } = await validateEntrypoint(entrypoint)

    /*
  * The importing of files forms a directed graph.
  * Vertices are source files and edges are from importing other files.
  * We can find all of the files we need to run the check by traversing this graph.
  * In this implementation, we use breadth first search.
  */
    const collector = new Collector(entrypoint, content)
    const bfsQueue: [{filePath: string, content: string}] = [{ filePath: entrypoint, content }]
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

      const resolvedDependencies = cache?.resolvedDependencies ??
        await this.resolver.resolveDependenciesForFilePath(item.filePath, module.dependencies)

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
    }

    collector.validate()

    return collector.getItems()
  }

  static parseDependencies (filePath: string, contents: string):
  { module: Module, error?: any } {
    const dependencies = new Set<string>()

    const extension = path.extname(filePath)
    try {
      if (extension === '.js' || extension === '.mjs') {
        const ast = acorn.parse(contents, {
          allowReturnOutsideFunction: true,
          ecmaVersion: 'latest',
          allowImportExportEverywhere: true,
          allowAwaitOutsideFunction: true,
        })
        walk.simple(ast, Parser.jsNodeVisitor(dependencies))
      } else if (extension === '.ts') {
        const tsParser = getTsParser()
        const ast = tsParser.parse(contents, {})
        // The AST from typescript-estree is slightly different from the type used by acorn-walk.
        // This doesn't actually cause problems (both are "ESTree's"), but we need to ignore type errors here.
        // @ts-ignore
        walk.simple(ast, Parser.tsNodeVisitor(tsParser, dependencies))
      } else if (extension === '.json') {
        // No dependencies to check.
      } else {
        throw new Error(`Unsupported file extension for ${filePath}`)
      }
    } catch (err) {
      return {
        module: {
          dependencies: Array.from(dependencies),
        },
        error: err,
      }
    }

    return {
      module: {
        dependencies: Array.from(dependencies),
      },
    }
  }

  static jsNodeVisitor (dependencies: Set<string>): any {
    return {
      CallExpression (node: Node) {
        if (!Parser.isRequireExpression(node)) return
        const requireStringArg = Parser.getRequireStringArg(node)
        Parser.registerDependency(requireStringArg, dependencies)
      },
      ImportDeclaration (node: any) {
        if (node.source.type !== 'Literal') return
        Parser.registerDependency(node.source.value, dependencies)
      },
      ExportNamedDeclaration (node: any) {
        if (node.source === null) return
        if (node.source.type !== 'Literal') return
        Parser.registerDependency(node.source.value, dependencies)
      },
      ExportAllDeclaration (node: any) {
        if (node.source === null) return
        if (node.source.type !== 'Literal') return
        Parser.registerDependency(node.source.value, dependencies)
      },
    }
  }

  static tsNodeVisitor (tsParser: any, dependencies: Set<string>): any {
    return {
      // While rare, TypeScript files may also use require.
      CallExpression (node: Node) {
        if (!Parser.isRequireExpression(node)) return
        const requireStringArg = Parser.getRequireStringArg(node)
        Parser.registerDependency(requireStringArg, dependencies)
      },
      ImportDeclaration (node: TSESTree.ImportDeclaration) {
      // For now, we only support literal strings in the import statement
        if (node.source.type !== tsParser.TSESTree.AST_NODE_TYPES.Literal) return
        Parser.registerDependency(node.source.value, dependencies)
      },
      ExportNamedDeclaration (node: TSESTree.ExportNamedDeclaration) {
      // The statement isn't importing another dependency
        if (node.source === null) return
        // For now, we only support literal strings in the export statement
        if (node.source.type !== tsParser.TSESTree.AST_NODE_TYPES.Literal) return
        Parser.registerDependency(node.source.value, dependencies)
      },
      ExportAllDeclaration (node: TSESTree.ExportAllDeclaration) {
        if (node.source === null) return
        // For now, we only support literal strings in the export statement
        if (node.source.type !== tsParser.TSESTree.AST_NODE_TYPES.Literal) return
        Parser.registerDependency(node.source.value, dependencies)
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
      return object.type === 'Identifier' &&
      object.name === 'module' &&
      property.type === 'Identifier' &&
      property.name === 'require'
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

  static registerDependency (importArg: string | null, dependencies: Set<string>) {
  // TODO: We currently don't support import path aliases, f.ex: `import { Something } from '@services/my-service'`
    if (!importArg) {
    // If there's no importArg, don't register a dependency
    } else {
      dependencies.add(importArg)
    }
  }
}
