import * as path from 'path'
import * as fs from 'fs'
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import { Collector } from './collector'
import { DependencyParseError } from './errors'
import { PackageFilesResolver, Dependencies } from './package-files/resolver'
// Only import types given this is an optional dependency
import type { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/typescript-estree'

// Our custom configuration to handle walking errors
// eslint-disable-next-line @typescript-eslint/no-empty-function
const ignore = (_node: any, _st: any, _c: any) => {}

type Module = {
  dependencies: Array<string>,
}

type SupportedFileExtension = '.js' | '.mjs' | '.ts'

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

function validateEntrypoint (entrypoint: string): {extension: SupportedFileExtension, content: string} {
  const extension = path.extname(entrypoint)
  if (extension !== '.js' && extension !== '.ts' && extension !== '.mjs') {
    throw new Error(`Unsupported file extension for ${entrypoint}`)
  }
  try {
    const content = fs.readFileSync(entrypoint, { encoding: 'utf-8' })
    return { extension, content }
  } catch (err) {
    throw new DependencyParseError(entrypoint, [entrypoint], [], [])
  }
}

let tsParser: any
function getTsParser (): any {
  if (tsParser) {
    return tsParser
  }

  try {
    tsParser = require('@typescript-eslint/typescript-estree')
    const AST_NODE_TYPES = tsParser.AST_NODE_TYPES as AST_NODE_TYPES
    // Our custom configuration to handle walking errors
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    Object.values(AST_NODE_TYPES).forEach((astType) => {
      // Only handle the TS specific ones
      if (!astType.startsWith('TS')) {
        return
      }
      walk.base[astType] = walk.base[astType] ?? ignore
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

  supportsModule (importPath: string): boolean {
    if (this.supportedModules.has(importPath)) {
      return true
    }

    if (this.supportedModules.has('node:' + importPath)) {
      return true
    }

    // Check namespaced modules and module subpaths.
    if (importPath.indexOf('/') !== -1) {
      if (importPath.startsWith('@')) {
        const [namespace, moduleName] = importPath.split('/', 3)
        if (this.supportedModules.has(namespace + '/' + moduleName)) {
          return true
        }
      } else {
        // Recurse to cover values with and without node: prefix.
        // This will not endlessly recurse because we remove the slash.
        const [moduleName] = importPath.split('/', 2)
        return this.supportsModule(moduleName)
      }
    }

    return false
  }

  parse (entrypoint: string) {
    const { content } = validateEntrypoint(entrypoint)

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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
        this.resolver.resolveDependenciesForFilePath(item.filePath, module.dependencies)

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
