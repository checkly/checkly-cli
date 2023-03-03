import * as path from 'path'
import * as fs from 'fs'
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import { Collector } from './collector'
import { DependencyParseError } from './errors'
// Only import types given this is an optional dependency
import type { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/typescript-estree'

// Our custom configuration to handle walking errors
// eslint-disable-next-line @typescript-eslint/no-empty-function
const ignore = (_node: any, _st: any, _c: any) => {}

type Module = {
  localDependencies: Array<string>,
  npmDependencies: Array<string>
}

type SupportedFileExtension = '.js' | '.ts'

const PACKAGE_EXTENSION = `${path.sep}package.json`

const JS_RESOLVE_ORDER = [
  '.js',
  PACKAGE_EXTENSION,
  `${path.sep}index.js`,
]

const TS_RESOLVE_ORDER = [
  '.ts',
  '.js',
  PACKAGE_EXTENSION,
  `${path.sep}index.ts`,
  `${path.sep}index.js`,
]

const supportedBuiltinModules = [
  'assert', 'buffer', 'crypto', 'dns', 'fs', 'path', 'querystring', 'readline ', 'stream', 'string_decoder',
  'timers', 'tls', 'url', 'util', 'zlib',
]

function validateEntrypoint (entrypoint: string): {extension: SupportedFileExtension, content: string} {
  const extension = path.extname(entrypoint)
  if (extension !== '.js' && extension !== '.ts') {
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

  parse (entrypoint: string) {
    const { extension, content } = validateEntrypoint(entrypoint)

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
      const { module, error } = Parser.parseDependencies(item.filePath, item.content)
      if (error) {
        collector.addParsingError(item.filePath, error.message)
        continue
      }
      const unsupportedDependencies = module.npmDependencies.filter((dep) => !this.supportedModules.has(dep))
      if (unsupportedDependencies.length) {
        collector.addUnsupportedNpmDependencies(item.filePath, unsupportedDependencies)
      }
      const localDependenciesResolvedPaths: Array<{filePath: string, content: string}> = []
      module.localDependencies.forEach((localDependency: string) => {
        const filePath = path.join(path.dirname(item.filePath), localDependency)
        try {
          const deps = Parser.readDependency(filePath, extension)
          localDependenciesResolvedPaths.push(...deps)
        } catch (err: any) {
          collector.addMissingFile(filePath)
        }
      })
      localDependenciesResolvedPaths.forEach(({ filePath, content }: {filePath: string, content: string}) => {
        if (collector.hasDependency(filePath)) {
          return
        }
        collector.addDependency(filePath, content)
        bfsQueue.push({ filePath, content })
      })
    }

    collector.validate()

    return collector.getItems()
  }

  static readDependency (filePath: string, preferedExtenstion: SupportedFileExtension) {
    // Read the specific file if it has an extension
    if (path.extname(filePath).length) {
      const content = fs.readFileSync(filePath, { encoding: 'utf-8' })
      return [{ filePath, content }]
    } else {
      if (preferedExtenstion === '.js') {
        return Parser.tryReadFileExt(filePath, JS_RESOLVE_ORDER)
      } else {
        return Parser.tryReadFileExt(filePath, TS_RESOLVE_ORDER)
      }
    }
  }

  static tryReadFileExt (filePath: string, exts: typeof JS_RESOLVE_ORDER | typeof TS_RESOLVE_ORDER) {
    for (const extension of exts) {
      try {
        const deps = []
        const fullPath = filePath + extension
        const content = fs.readFileSync(fullPath, { encoding: 'utf-8' })
        deps.push({ filePath: fullPath, content })
        if (extension === PACKAGE_EXTENSION) {
          const { main } = JSON.parse(content)
          if (!main || !main.length) {
            // No main is defined. This means package.json doesn't have a specific entry
            continue
          }
          const mainFile = path.join(filePath, main)
          deps.push({
            filePath: mainFile, content: fs.readFileSync(mainFile, { encoding: 'utf-8' }),
          })
        }
        return deps
      } catch (err) {}
    }
    throw new Error(`Cant find file ${filePath}`)
  }

  static parseDependencies (filePath: string, contents: string):
  { module: Module, error?: any } {
    const localDependencies = new Set<string>()
    const npmDependencies = new Set<string>()

    const extension = path.extname(filePath)
    try {
      if (extension === '.js') {
        const ast = acorn.parse(contents, {
          allowReturnOutsideFunction: true,
          ecmaVersion: 'latest',
          allowImportExportEverywhere: true,
        })
        walk.simple(ast, Parser.jsNodeVisitor(localDependencies, npmDependencies))
      } else if (extension === '.ts') {
        const tsParser = getTsParser()
        const ast = tsParser.parse(contents, {})
        // The AST from typescript-estree is slightly different from the type used by acorn-walk.
        // This doesn't actually cause problems (both are "ESTree's"), but we need to ignore type errors here.
        // @ts-ignore
        walk.simple(ast, Parser.tsNodeVisitor(tsParser, localDependencies, npmDependencies))
      } else {
        throw new Error(`Unsupported file extension for ${filePath}`)
      }
    } catch (err) {
      return {
        module: {
          localDependencies: Array.from(localDependencies),
          npmDependencies: Array.from(npmDependencies),
        },
        error: err,
      }
    }

    return {
      module: {
        localDependencies: Array.from(localDependencies),
        npmDependencies: Array.from(npmDependencies),
      },
    }
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
