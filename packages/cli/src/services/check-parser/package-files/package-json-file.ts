import path from 'node:path'

import semver from 'semver'

import { JsonSourceFile } from './json-source-file'
import { FileMeta, SourceFile } from './source-file'
import { PathResolver, ResolveResult } from './paths'

type ConditionKey =
  | 'node-addons'
  | 'node'
  | 'import'
  | 'require'
  | 'module-sync'
  | 'default'
  // Allow any string value, but keep auto complete for known values.
  | (string & Record<never, never>)

// Per the Node.js spec, an exports target can be a string, null (to block
// the export), an array of fallback targets, or an object of nested
// conditions. Conditions can themselves contain any of these recursively.
// See https://nodejs.org/api/packages.html#conditional-exports
type ExportTarget =
  | string
  | null
  | ExportTarget[]
  | { [K in ConditionKey]?: ExportTarget }

type Exports =
  | string
  | Record<string, ExportTarget>

type Imports =
  | Record<string, ExportTarget>

type Schema = {
  name?: string
  version?: string
  license?: string
  main?: string
  engines?: Record<string, string>
  exports?: Exports
  imports?: Imports
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  private?: boolean
  workspaces?: string[]
}

export interface EngineSupportResult {
  engine: string
  requirements?: string
  incompatible: boolean
}

export class PackageJsonFile {
  static FILENAME = 'package.json'

  static #id = 0
  readonly id = ++PackageJsonFile.#id

  jsonFile: JsonSourceFile<Schema>
  basePath: string
  mainPaths: string[]

  private constructor (jsonFile: JsonSourceFile<Schema>) {
    this.jsonFile = jsonFile
    this.basePath = jsonFile.meta.dirname

    const fallbackMainPath = path.resolve(this.basePath, 'index.js')

    this.mainPaths = jsonFile.data.main !== undefined
      ? [path.resolve(this.basePath, jsonFile.data.main), fallbackMainPath]
      : [fallbackMainPath]
  }

  hasExports (): boolean {
    return !!this.jsonFile.data.exports
  }

  resolveExportPath (exportPath: string, conditions: ConditionKey[]): ResolveResult {
    const resolver = PathResolver.createFromPaths(
      this.basePath,
      this.#resolveExports(this.jsonFile.data.exports ?? {}, conditions),
    )

    // Exports must always start with "./" - make sure that the path we're
    // matching against also starts with that prefix.
    if (!exportPath.startsWith('./')) {
      exportPath = `./${exportPath}`
    }

    return resolver.resolve(exportPath)
  }

  #resolveExports (exports: Exports, conditions: ConditionKey[]): Record<string, string[]> {
    if (typeof exports === 'string') {
      return {
        '.': [exports],
      }
    }

    const resolved: Record<string, string[]> = {}

    for (const [from, target] of Object.entries(exports)) {
      const resolvedTarget = this.#resolveExportTarget(target, conditions)
      if (resolvedTarget !== undefined) {
        resolved[from] = [resolvedTarget]
      }
    }

    return resolved
  }

  /**
   * Recursively resolves an export target against the provided conditions,
   * following the Node.js conditional exports resolution algorithm.
   *
   * Returns the first matching string target, or `undefined` if the target
   * resolves to `null` (blocked export) or cannot be resolved for the given
   * conditions.
   */
  #resolveExportTarget (target: ExportTarget, conditions: ConditionKey[]): string | undefined {
    // null explicitly blocks an export.
    if (target === null) {
      return undefined
    }

    // Direct string target — we're done.
    if (typeof target === 'string') {
      return target
    }

    // Array — try each fallback in order until one resolves.
    if (Array.isArray(target)) {
      for (const item of target) {
        const resolvedItem = this.#resolveExportTarget(item, conditions)
        if (resolvedItem !== undefined) {
          return resolvedItem
        }
      }
      return undefined
    }

    // Object — iterate conditions in insertion order (per the Node.js spec,
    // `default` is expected to be the last key in a condition object).
    if (typeof target === 'object') {
      for (const [condition, nested] of Object.entries(target)) {
        if (!conditions.includes(condition)) {
          continue
        }
        const resolvedNested = this.#resolveExportTarget(nested as ExportTarget, conditions)
        if (resolvedNested !== undefined) {
          return resolvedNested
        }
      }
      return undefined
    }

    return undefined
  }

  public get meta () {
    return this.jsonFile.meta
  }

  public get name () {
    return this.jsonFile.data.name
  }

  public get version () {
    return this.jsonFile.data.version
  }

  public get dependencies () {
    return this.jsonFile.data.dependencies
  }

  public get devDependencies () {
    return this.jsonFile.data.devDependencies
  }

  public get engines () {
    return this.jsonFile.data.engines
  }

  public get workspaces () {
    return this.jsonFile.data.workspaces
  }

  supportsEngine (engine: string, version: string): EngineSupportResult {
    const requirements = this.engines?.[engine]
    if (requirements === undefined) {
      return {
        engine,
        incompatible: false,
      }
    }

    try {
      const ok = semver.satisfies(version, requirements)

      return {
        engine,
        requirements,
        incompatible: !ok,
      }
    } catch {
      return {
        engine,
        requirements,
        incompatible: false,
      }
    }
  }

  static make (filePath: string, data: Schema): PackageJsonFile {
    const contents = formatContents(data)
    const sourceFile = new SourceFile(FileMeta.fromFilePath(filePath), contents)
    const jsonFile = new JsonSourceFile<Schema>(sourceFile, data)
    return new PackageJsonFile(jsonFile)
  }

  // eslint-disable-next-line require-await
  static async loadFromJsonSourceFile (jsonFile: JsonSourceFile<Schema>): Promise<PackageJsonFile | undefined> {
    return new PackageJsonFile(jsonFile)
  }

  static async loadFromSourceFile (sourceFile: SourceFile): Promise<PackageJsonFile | undefined> {
    const jsonSourceFile = await JsonSourceFile.loadFromSourceFile<Schema>(sourceFile)
    if (!jsonSourceFile) {
      return
    }

    return PackageJsonFile.loadFromJsonSourceFile(jsonSourceFile)
  }

  static async loadFromFilePath (filePath: string): Promise<PackageJsonFile | undefined> {
    const sourceFile = await SourceFile.loadFromFilePath(filePath)
    if (!sourceFile) {
      return
    }

    return PackageJsonFile.loadFromSourceFile(sourceFile)
  }

  static filePath (dirPath: string) {
    return path.join(dirPath, PackageJsonFile.FILENAME)
  }

  upsertDependencies (dependencies: Record<string, string>): boolean {
    const result = updateDependencies(this.jsonFile.data.dependencies, dependencies)
    if (!result.changed) {
      return false
    }

    this.jsonFile.data.dependencies = sortDependencies(result.dependencies)

    return true
  }

  upsertDevDependencies (dependencies: Record<string, string>): boolean {
    const result = updateDependencies(this.jsonFile.data.devDependencies, dependencies)
    if (!result.changed) {
      return false
    }

    this.jsonFile.data.devDependencies = sortDependencies(result.dependencies)

    return true
  }

  toJSON (): string {
    return formatContents(this.jsonFile.data)
  }
}

function updateDependencies (
  oldDependencies: Record<string, string> = {},
  newDependencies: Record<string, string> = {},
): { dependencies: Record<string, string>, changed: boolean } {
  const result = {
    dependencies: { ...oldDependencies },
    changed: false,
  }

  const safeMinVersion = (version: string) => {
    try {
      return semver.minVersion(version)
    } catch {
      return null
    }
  }

  for (const [name, newVersion] of Object.entries(newDependencies)) {
    const oldVersion = oldDependencies[name]
    if (oldVersion !== undefined) {
      const oldMinVersion = safeMinVersion(oldVersion)
      if (oldMinVersion === null) {
        // Assume it's something we shouldn't change.
        continue
      }

      const newMinVersion = safeMinVersion(newVersion)
      if (newMinVersion === null) {
        // This should not happen.
        throw new Error(`Invalid new version '${newVersion}' for dependency '${name}'`)
      }

      if (oldMinVersion.compare(newMinVersion) >= 0) {
        // It's recent enough.
        continue
      }
    }

    result.changed = true
    result.dependencies[name] = newVersion
  }

  return result
}

function sortDependencies (dependencies: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.keys(dependencies).sort().map(name => {
      return [name, dependencies[name]]
    }),
  )
}

function formatContents (data: Schema): string {
  // NPM adds a trailing newline, so we do too.
  return JSON.stringify(data, null, 2) + '\n'
}
