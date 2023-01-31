import * as path from 'path'
import * as fs from 'fs'
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import { TSESTree } from '@typescript-eslint/typescript-estree'
import { Collector } from './collector'

enum SupportedExtensions {
  JS = '.js',
  TS = '.ts'
}

const supportedBuiltinModules = [
  'assert', 'buffer', 'crypto', 'dns', 'fs', 'path', 'querystring', 'readline ', 'stream', 'string_decoder',
  'timers', 'tls', 'url', 'util', 'zlib',
]

function parseExtension (entrypoint: string) {
  switch (path.extname(entrypoint)) {
    case SupportedExtensions.JS:
      return SupportedExtensions.JS
    case SupportedExtensions.TS:
      return SupportedExtensions.TS
    default:
      throw new Error(`Unsupported file extension for ${entrypoint}`)
  }
}

function getTsParser (): any {
  try {
    return require('@typescript-eslint/typescript-estree')
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      throw new Error('Please install typescript to use TypeScript in check files')
    }
    throw err
  }
}

export class Parser {
  supportedModules: Set<string>

  // TODO: pass a npm matrix of supported npm modules
  // Maybe pass a cache so we don't have to fetch files separately all the time
  constructor (supportedNpmModules: Array<string>) {
    this.supportedModules = new Set([...supportedBuiltinModules, ...supportedNpmModules])
  }

  parseDependencies (entrypoint: string): string[] {
    const extension = parseExtension(entrypoint)

    /*
  * The importing of files forms a directed graph.
  * Vertices are source files and edges are from importing other files.
  * We can find all of the files we need to run the check by traversing this graph.
  * In this implementation, we use breadth first search.
  */
    const collector = new Collector(entrypoint)
    // Stop adding entrypoint as dependency later on
    collector.addDependency(entrypoint)
    const bfsQueue: string[] = [entrypoint]
    while (bfsQueue.length > 0) {
    // Since we just checked the length, shift() will never return undefined.
    // We can add a not-null assertion operator (!).
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const currentPath = bfsQueue.shift()!
      try {
        const { localDependencies, npmDependencies } = Parser.parseDependenciesForFile(currentPath)
        const unsupportedDependencies = npmDependencies.filter((dep) => !this.supportedModules.has(dep))
        if (unsupportedDependencies.length) {
          collector.addUnsupportedNpmDependencies(currentPath, unsupportedDependencies)
        }
        const localDependenciesResolvedPaths = localDependencies.map((localDependency: string) => {
        // Convert a relative path to an absolute path.
          const resolvedPath = path.join(path.dirname(currentPath), localDependency)
          // The import call may not have the .js / .ts extension, so we add it here.
          // We assume that the other file is also a JS or typescript file based on the entrypoint file type.
          // At some point, though, it may make sense to add support for mixing JS and typescript.
          return Parser.addExtension(extension, resolvedPath)
        })
        localDependenciesResolvedPaths.forEach((path: string) => {
          if (!collector.hasDependency(path)) {
            collector.addDependency(path)
            bfsQueue.push(path)
          }
        })
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          collector.addMissingFile(currentPath)
        } else {
          collector.addParsingError(currentPath, err.message)
        }
      }
    }

    collector.validate()

    return collector.collect()
  }

  static addExtension (extension: string, filePath: string) {
    if (!filePath.endsWith(extension)) {
      return filePath + extension
    } else {
      return filePath
    }
  }

  static parseDependenciesForFile (filePath: string): { localDependencies: string[], npmDependencies: string[] } {
    const localDependencies = new Set<string>()
    const npmDependencies = new Set<string>()
    const contents = fs.readFileSync(filePath, { encoding: 'utf8' })

    const extension = path.extname(filePath)

    if (extension === SupportedExtensions.JS) {
      const ast = acorn.parse(contents, {
        allowReturnOutsideFunction: true,
        ecmaVersion: 'latest',
        allowImportExportEverywhere: true,
      })
      walk.simple(ast, Parser.jsNodeVisitor(localDependencies, npmDependencies))
    } else if (extension === SupportedExtensions.TS) {
      const tsParser = getTsParser()
      const ast = tsParser.parse(contents, {})
      // The AST from typescript-estree is slightly different from the type used by acorn-walk.
      // This doesn't actually cause problems (both are "ESTree's"), but we need to ignore type errors here.
      // @ts-ignore
      walk.simple(ast, Parser.tsNodeVisitor(tsParser, localDependencies, npmDependencies))
    } else {
      throw new Error(`Unsupported file extension for ${filePath}`)
    }

    return { localDependencies: Array.from(localDependencies), npmDependencies: Array.from(npmDependencies) }
  }

  static jsNodeVisitor (localDependencies: Set<string>, npmDependencies: Set<string>): any {
    return {
      CallExpression (node: Node) {
        if (!Parser.isRequireExpression(node)) return
        const requireStringArg = Parser.getRequireStringArg(node)
        Parser.registerDependency(requireStringArg, localDependencies, npmDependencies)
      },
      ImportDeclaration (node: any) {
        if (node.source.type !== 'Literal') return
        Parser.registerDependency(node.source.value, localDependencies, npmDependencies)
      },
      ExportNamedDeclaration (node: any) {
        if (node.source === null) return
        if (node.source.type !== 'Literal') return
        Parser.registerDependency(node.source.value, localDependencies, npmDependencies)
      },
    }
  }

  static tsNodeVisitor (tsParser: any, localDependencies: Set<string>, npmDependencies: Set<string>): any {
    return {
      ImportDeclaration (node: TSESTree.ImportDeclaration) {
      // For now, we only support literal strings in the import statement
        if (node.source.type !== tsParser.TSESTree.AST_NODE_TYPES.Literal) return
        Parser.registerDependency(node.source.value, localDependencies, npmDependencies)
      },
      ExportNamedDeclaration (node: TSESTree.ExportNamedDeclaration) {
      // The statement isn't importing another dependency
        if (node.source === null) return
        // For now, we only support literal strings in the import statement
        if (node.source.type !== tsParser.TSESTree.AST_NODE_TYPES.Literal) return
        Parser.registerDependency(node.source.value, localDependencies, npmDependencies)
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

  static registerDependency (importArg: string | null, localDependencies: Set<string>, npmDependencies: Set<string>) {
  // TODO: We currently don't support import path aliases, f.ex: `import { Something } from '@services/my-service'`
    if (!importArg) {
    // If there's no importArg, don't register a dependency
    } else if (importArg.startsWith('/') || importArg.startsWith('./') || importArg.startsWith('../')) {
      localDependencies.add(importArg)
    } else {
      npmDependencies.add(importArg)
    }
  }
}
