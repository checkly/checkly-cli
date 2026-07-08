import path from 'node:path'

import { SourceFile } from './source-file.js'
import { JsonSourceFile } from './json-source-file.js'
import { JsonTextSourceFile } from './json-text-source-file.js'
import { PathResolver, ResolveResult } from './paths.js'

type Module =
  'none' | 'commonjs' | 'amd' | 'system' | 'es6' | 'es2015' | 'es2020'
  | 'es2022' | 'esnext' | 'node16' | 'nodenext' | 'preserve'

type ModuleResolution =
  'classic' | 'node10' | 'node' | 'node16' | 'nodenext' | 'bundler'

type Paths = Record<string, Array<string>>

interface CompilerOptions {
  module?: Module
  moduleResolution?: ModuleResolution
  baseUrl?: string
  paths?: Paths

  /**
   * If set, .js files will be emitted into this directory.
   *
   * If not set, .js files are placed right next to .ts files in the same
   * folder.
   *
   * @see https://www.typescriptlang.org/tsconfig/#outDir
   */
  outDir?: string

  /**
   * If not set, rootDir is inferred to be the longest common path of all
   * non-declaration input files, unless `composite: true`, in which case
   * the inferred root is the directory containing the tsconfig.json file.
   *
   * @see https://www.typescriptlang.org/tsconfig/#rootDir
   */
  rootDir?: string

  /**
   * Allow multiple directions to act as a single root. Source files will be
   * able to refer to files in other roots as if they were present in the same
   * root.
   *
   * @see https://www.typescriptlang.org/tsconfig/#rootDirs
   */
  rootDirs?: string[]

  /**
   * If true, the default rootDir is the directory containing the
   * tsconfig.json file.
   *
   * @see https://www.typescriptlang.org/tsconfig/#composite
   */
  composite?: boolean
}

export interface Schema {
  /**
   * Path(s) to one or more configuration files this config inherits from. May
   * be a single specifier or, since TypeScript 5.0, an array. Later array
   * entries override earlier ones and this config overrides all of them.
   *
   * @see https://www.typescriptlang.org/tsconfig/#extends
   */
  extends?: string | string[]
  compilerOptions?: CompilerOptions
}

/**
 * A configuration file reached through another config's `extends` property.
 *
 * `bundle` indicates whether the config is a local project file that must be
 * included in the deployment bundle (a relative/absolute path or a
 * workspace-member package) as opposed to an external `node_modules` package
 * that the runner restores from `package.json` and therefore does not need to
 * be bundled.
 */
export type ExtendedConfig = {
  jsonFile: JsonSourceFile<Schema>
  bundle: boolean
}

/**
 * Resolves a config referenced by another config's `extends` property. The
 * resolver supplies this so that config loading can pull in the chain of
 * extended configs without the file-loading machinery leaking into this module.
 */
export type ResolveExtends =
  (specifier: string, fromDir: string) => Promise<ExtendedConfig | undefined>

/**
 * A value together with the directory of the config file that declared it.
 * Relative paths in `extends`'d configs resolve relative to the file they
 * originated in, so the origin directory must travel with each value.
 */
type Origin<T> = {
  value: T
  dir: string
}

/**
 * The effective compiler options after merging an `extends` chain. For each
 * option the leaf-most config that declares it wins (options are replaced, not
 * deep-merged), and each path-bearing option remembers its origin directory.
 */
interface EffectiveOptions {
  baseUrl?: Origin<string>
  paths?: Origin<Paths>
  outDir?: Origin<string>
  rootDir?: Origin<string>
  rootDirs?: Origin<string[]>
  moduleResolution?: string
}

/**
 * One link in a flattened `extends` chain, ordered from lowest to highest
 * precedence. `bundle` carries whether the link's source file must be bundled.
 */
export type ChainLink = {
  jsonFile: JsonSourceFile<Schema>
  bundle: boolean
}

export class TSConfigFile {
  static FILENAME = 'tsconfig.json'

  static #id = 0
  readonly id = ++TSConfigFile.#id

  jsonFile: JsonSourceFile<Schema>
  basePath: string
  moduleResolution: string
  baseUrl: string
  pathResolver: PathResolver

  /**
   * Source files of the configs reached through `extends` that must be bundled
   * alongside this config (relative/absolute paths and workspace-member
   * packages). External `node_modules` configs are excluded — they only
   * contribute their compiler options, not a bundled file.
   */
  bundledExtendsSourceFiles: SourceFile[]

  // Effective output/root directories, resolved to absolute paths against the
  // directory of the config that declared each one.
  #outDir?: string
  #rootDir?: string
  #rootDirs?: string[]

  relatedSourceFiles: SourceFile[] = []

  protected constructor (
    jsonFile: JsonSourceFile<Schema>,
    chain: ChainLink[],
  ) {
    this.jsonFile = jsonFile

    this.basePath = jsonFile.meta.dirname

    // The leaf config (the last link) is bundled by the resolver; only its
    // bundlable bases need to be carried here.
    this.bundledExtendsSourceFiles = chain
      .slice(0, -1)
      .filter(link => link.bundle)
      .map(link => link.jsonFile.sourceFile)

    const effective = TSConfigFile.#computeEffectiveOptions(chain)

    this.moduleResolution = effective.moduleResolution?.toLocaleLowerCase() ?? 'unspecified'

    const baseUrlAbs = effective.baseUrl !== undefined
      ? path.resolve(effective.baseUrl.dir, effective.baseUrl.value)
      : undefined

    this.baseUrl = baseUrlAbs ?? this.basePath

    // Paths resolve relative to baseUrl when it is set anywhere in the chain,
    // otherwise relative to the directory of the config that declared paths.
    const pathsRoot = baseUrlAbs ?? effective.paths?.dir ?? this.basePath
    this.pathResolver = PathResolver.createFromPaths(pathsRoot, effective.paths?.value ?? {})

    this.#outDir = effective.outDir !== undefined
      ? path.resolve(effective.outDir.dir, effective.outDir.value)
      : undefined

    this.#rootDir = effective.rootDir !== undefined
      ? path.resolve(effective.rootDir.dir, effective.rootDir.value)
      : undefined

    const rootDirs = effective.rootDirs
    this.#rootDirs = rootDirs !== undefined
      ? rootDirs.value.map(dir => path.resolve(rootDirs.dir, dir))
      : undefined
  }

  public get meta () {
    return this.jsonFile.meta
  }

  static async loadFromJsonTextSourceFile (
    jsonFile: JsonTextSourceFile<Schema>,
    resolveExtends: ResolveExtends,
  ): Promise<TSConfigFile | undefined> {
    const chain = await TSConfigFile.buildChain(jsonFile, false, resolveExtends, new Set())
    return new TSConfigFile(jsonFile, chain)
  }

  static filePath (dirPath: string) {
    return path.join(dirPath, TSConfigFile.FILENAME)
  }

  /**
   * Depth-first expands the `extends` chain into links ordered from lowest to
   * highest precedence (this config last). A config that `extends` an array
   * inherits later entries with higher precedence than earlier ones. Cycles are
   * terminated by tracking visited config paths.
   */
  protected static async buildChain (
    jsonFile: JsonSourceFile<Schema>,
    bundle: boolean,
    resolveExtends: ResolveExtends,
    visited: Set<string>,
  ): Promise<ChainLink[]> {
    const filePath = jsonFile.meta.filePath
    if (visited.has(filePath)) {
      return []
    }
    visited.add(filePath)

    const chain: ChainLink[] = []

    const { extends: extendsValue } = jsonFile.data
    const specifiers = extendsValue === undefined
      ? []
      : Array.isArray(extendsValue) ? extendsValue : [extendsValue]

    for (const specifier of specifiers) {
      const resolved = await resolveExtends(specifier, jsonFile.meta.dirname)
      if (resolved === undefined) {
        continue
      }
      chain.push(...await TSConfigFile.buildChain(
        resolved.jsonFile,
        resolved.bundle,
        resolveExtends,
        visited,
      ))
    }

    chain.push({ jsonFile, bundle })

    return chain
  }

  static #computeEffectiveOptions (chain: ChainLink[]): EffectiveOptions {
    const effective: EffectiveOptions = {}

    for (const { jsonFile } of chain) {
      const compilerOptions = jsonFile.data.compilerOptions
      if (compilerOptions === undefined) {
        continue
      }

      const dir = jsonFile.meta.dirname

      if (compilerOptions.baseUrl !== undefined) {
        effective.baseUrl = { value: compilerOptions.baseUrl, dir }
      }

      if (compilerOptions.paths !== undefined) {
        effective.paths = { value: compilerOptions.paths, dir }
      }

      if (compilerOptions.outDir !== undefined) {
        effective.outDir = { value: compilerOptions.outDir, dir }
      }

      if (compilerOptions.rootDir !== undefined) {
        effective.rootDir = { value: compilerOptions.rootDir, dir }
      }

      if (compilerOptions.rootDirs !== undefined) {
        effective.rootDirs = { value: compilerOptions.rootDirs, dir }
      }

      if (compilerOptions.moduleResolution !== undefined) {
        effective.moduleResolution = compilerOptions.moduleResolution
      }
    }

    return effective
  }

  resolvePath (importPath: string): ResolveResult {
    return this.pathResolver.resolve(importPath)
  }

  collectLookupPaths (filePath: string): string[] {
    const candidates = []

    const outDir = this.#outDir

    if (outDir === undefined) {
      candidates.push(path.resolve(this.basePath, filePath))
      return candidates // Nothing more we can do.
    }

    // Inferred rootDir is the config directory when not explicitly set. (This is
    // also the inferred value when composite is true; computing the true longest
    // common path of all input files would be far more effort than it's worth.)
    const rootDir = this.#rootDir ?? this.basePath

    const relativePath = path.relative(outDir, filePath)

    // If the file is outside outDir, then assume we're looking for
    // something that wasn't compiled using this tsconfig (or at all), and
    // stop looking.
    if (relativePath.startsWith('..')) {
      candidates.push(path.resolve(this.basePath, filePath))
      return candidates
    }

    candidates.push(path.resolve(rootDir, relativePath))

    // Assume that our inferred (or user specified) rootDir is enough to cover
    // the same conditions we'd have to infer rootDirs, and only add rootDirs
    // if they're actually set.
    for (const multiRootDir of this.#rootDirs ?? []) {
      candidates.push(path.resolve(multiRootDir, relativePath))
    }

    return candidates
  }

  registerRelatedSourceFile (file: SourceFile) {
    this.relatedSourceFiles.push(file)
  }
}
