import * as path from 'path'
import * as fs from 'fs'
import * as acorn from 'acorn'
import * as tsParser from '@typescript-eslint/typescript-estree'
import { TSESTree } from '@typescript-eslint/typescript-estree'
import * as walk from 'acorn-walk'

type UnsupportedNpmDependencies = {
  file: string;
  unsupportedDependencies: string[];
}

type ParseError = {
  file: string;
  error: string;
}

export class DependencyParseError extends Error {
  missingFiles: string[]
  unsupportedNpmDependencies: UnsupportedNpmDependencies[]
  parseErrors: ParseError[]
  constructor (
    missingFiles: string[],
    unsupportedNpmDependencies: UnsupportedNpmDependencies[],
    parseErrors: ParseError[],
  ) {
    super()
    this.missingFiles = missingFiles
    this.unsupportedNpmDependencies = unsupportedNpmDependencies
    this.parseErrors = parseErrors
  }
}

const supportedBuiltinModules = [
  'assert', 'buffer', 'crypto', 'dns', 'fs', 'path', 'querystring', 'readline ', 'stream', 'string_decoder',
  'timers', 'tls', 'url', 'util', 'zlib',
]

// TODO: Make this per-runtime. It may also make sense to fetch from the Checkly API.
const supportedNpmModules = [
  'timers', 'tls', 'url', 'util', 'zlib', '@faker-js/faker', '@opentelemetry/api', '@opentelemetry/sd-trace-base',
  '@playwright/test', 'aws4', 'axios', 'btoa', 'chai', 'chai-string', 'crypto-js', 'expect', 'form-data',
  'jsonwebtoken', 'lodash', 'mocha', 'moment', 'otpauth', 'playwright', 'uuid',
]
const supportedModules = new Set([...supportedBuiltinModules, ...supportedNpmModules])

export function parseDependencies (entrypoint: string): string[] {
  let extension: string
  if (entrypoint.endsWith('.js')) {
    extension = '.js'
  } else if (entrypoint.endsWith('.ts')) {
    extension = '.ts'
  } else {
    throw new Error(`Unsupported file extension for ${entrypoint}`)
  }

  /*
  * The importing of files forms a directed graph.
  * Vertices are source files and edges are from importing other files.
  * We can find all of the files we need to run the check by traversing this graph.
  * In this implementation, we use breadth first search.
  */
  const missingFiles: string[] = []
  const unsupportedNpmDependencies: UnsupportedNpmDependencies[] = []
  const parseErrors: ParseError[] = []
  const dependencies = new Set<string>()
  dependencies.add(entrypoint)
  const bfsQueue: string[] = [entrypoint]
  while (bfsQueue.length > 0) {
    // Since we just checked the length, shift() will never return undefined.
    // We can add a not-null assertion operator (!).
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const currentPath = bfsQueue.shift()!
    try {
      const { localDependencies, npmDependencies } = parseDependenciesForFile(currentPath)
      const unsupportedDependencies = npmDependencies.filter((dep) => !supportedModules.has(dep))
      if (unsupportedDependencies.length) {
        unsupportedNpmDependencies.push({ file: currentPath, unsupportedDependencies })
      }
      const localDependenciesResolvedPaths = localDependencies.map((localDependency: string) => {
        // Convert a relative path to an absolute path.
        const resolvedPath = path.join(path.dirname(currentPath), localDependency)
        // The import call may not have the .js / .ts extension, so we add it here.
        // We assume that the other file is also a JS or typescript file based on the entrypoint file type.
        // At some point, though, it may make sense to add support for mixing JS and typescript.
        return addExtension(extension, resolvedPath)
      })
      localDependenciesResolvedPaths.forEach((path: string) => {
        if (!dependencies.has(path)) {
          dependencies.add(path)
          bfsQueue.push(path)
        }
      })
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        missingFiles.push(currentPath)
      } else {
        parseErrors.push({ file: currentPath, error: err.message })
      }
    }
  }

  if (missingFiles.length || parseErrors.length || unsupportedNpmDependencies.length) {
    throw new DependencyParseError(missingFiles, unsupportedNpmDependencies, parseErrors)
  }

  dependencies.delete(entrypoint)
  return Array.from(dependencies)
}

function addExtension (extension: string, filePath: string) {
  if (!filePath.endsWith(extension)) {
    return filePath + extension
  } else {
    return filePath
  }
}

function parseDependenciesForFile (filePath: string): { localDependencies: string[], npmDependencies: string[] } {
  const localDependencies = new Set<string>()
  const npmDependencies = new Set<string>()
  const contents = fs.readFileSync(filePath, { encoding: 'utf8' })

  if (filePath.endsWith('.js')) {
    const ast = acorn.parse(contents, { allowReturnOutsideFunction: true, ecmaVersion: 'latest' })
    walk.simple(ast, jsNodeVisitor(localDependencies, npmDependencies))
  } else if (filePath.endsWith('.ts')) {
    const ast = tsParser.parse(contents, {})
    // The AST from typescript-estree is slightly different from the type used by acorn-walk.
    // This doesn't actually cause problems (both are "ESTree's"), but we need to ignore type errors here.
    // @ts-ignore
    walk.simple(ast, tsNodeVisitor(localDependencies, npmDependencies))
  } else {
    throw new Error(`Unsupported file extension for ${filePath}`)
  }

  return { localDependencies: Array.from(localDependencies), npmDependencies: Array.from(npmDependencies) }
}

function jsNodeVisitor (localDependencies: Set<string>, npmDependencies: Set<string>): any {
  return {
    CallExpression (node: Node) {
      if (!isRequireExpression(node)) return
      const requireStringArg = getRequireStringArg(node)
      registerDependency(requireStringArg, localDependencies, npmDependencies)
    },
  }
}

function tsNodeVisitor (localDependencies: Set<string>, npmDependencies: Set<string>): any {
  return {
    ImportDeclaration (node: TSESTree.ImportDeclaration) {
      // For now, we only support literal strings in the import statement
      if (node.source.type !== TSESTree.AST_NODE_TYPES.Literal) return
      registerDependency(node.source.value, localDependencies, npmDependencies)
    },
    ExportNamedDeclaration (node: TSESTree.ExportNamedDeclaration) {
      // The statement isn't importing another dependency
      if (node.source === null) return
      // For now, we only support literal strings in the import statement
      if (node.source.type !== TSESTree.AST_NODE_TYPES.Literal) return
      registerDependency(node.source.value, localDependencies, npmDependencies)
    },
  }
}

function isRequireExpression (node: any): boolean {
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

function getRequireStringArg (node: any): string | null {
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

function registerDependency (importArg: string | null, localDependencies: Set<string>, npmDependencies: Set<string>) {
  // TODO: We currently don't support import path aliases, f.ex: `import { Something } from '@services/my-service'`
  if (!importArg) {
    // If there's no importArg, don't register a dependency
  } else if (importArg.startsWith('/') || importArg.startsWith('./') || importArg.startsWith('../')) {
    localDependencies.add(importArg)
  } else {
    npmDependencies.add(importArg)
  }
}
