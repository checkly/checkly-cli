import path from 'node:path'

import { SourceFile } from './source-file'
import { JsonSourceFile } from './json-source-file'
import { PathResolver, ResolveResult } from './paths'

type Module =
  'none' | 'commonjs' | 'amd' | 'system' | 'es6' | 'es2015' | 'es2020' |
  'es2022' | 'esnext' | 'node16' | 'nodenext' | 'preserve'

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
  compilerOptions?: CompilerOptions
}

export class TSConfigFile {
  static FILENAME = 'tsconfig.json'

  static #id = 0
  readonly id = ++TSConfigFile.#id

  jsonFile: JsonSourceFile<Schema>
  basePath: string
  moduleResolution: string
  baseUrl?: string
  pathResolver: PathResolver

  relatedSourceFiles: SourceFile[] = []

  protected constructor (jsonFile: JsonSourceFile<Schema>) {
    this.jsonFile = jsonFile

    this.basePath = jsonFile.meta.dirname

    this.moduleResolution = jsonFile.data.compilerOptions?.moduleResolution?.toLocaleLowerCase() ?? 'unspecified'

    const baseUrl = jsonFile.data.compilerOptions?.baseUrl
    if (baseUrl !== undefined) {
      this.baseUrl = path.resolve(this.jsonFile.meta.dirname, baseUrl)
    }

    this.pathResolver = PathResolver.createFromPaths(this.baseUrl ?? '.', jsonFile.data.compilerOptions?.paths ?? {})
  }

  public get meta () {
    return this.jsonFile.meta
  }

  static loadFromJsonSourceFile (jsonFile: JsonSourceFile<Schema>): TSConfigFile | undefined {
    return new TSConfigFile(jsonFile)
  }

  static filePath (dirPath: string) {
    return path.join(dirPath, TSConfigFile.FILENAME)
  }

  resolvePath (importPath: string): ResolveResult {
    return this.pathResolver.resolve(importPath)
  }

  collectLookupPaths (filePath: string): string[] {
    let {
      // eslint-disable-next-line prefer-const
      outDir,
      rootDir,
      // eslint-disable-next-line prefer-const
      rootDirs,
      composite,
    } = this.jsonFile.data.compilerOptions ?? {}

    const candidates = []

    if (outDir === undefined) {
      candidates.push(path.resolve(this.basePath, filePath))
      return candidates // Nothing more we can do.
    }

    if (composite === undefined) {
      composite = false
    }

    // Inferred rootDir is tsconfig directory if composite === true.
    if (rootDir === undefined && composite) {
      rootDir = '.'
    }

    // If we still don't have a root, we should calculate the longest common
    // path among input files, but that's a lot of effort. Assume tsconfig
    // directory and hope for the best.
    if (rootDir === undefined) {
      rootDir = '.'
    }

    const absoluteOutDir = path.resolve(this.basePath, outDir)
    const relativePath = path.relative(absoluteOutDir, filePath)

    // If the file is outside outDir, then assume we're looking for
    // something that wasn't compiled using this tsconfig (or at all), and
    // stop looking.
    if (relativePath.startsWith('..')) {
      candidates.push(path.resolve(this.basePath, filePath))
      return candidates
    }

    candidates.push(path.resolve(this.basePath, rootDir, relativePath))

    // Assume that our inferred (or user specified) rootDir is enough to cover
    // the same conditions we'd have to infer rootDirs, and only add rootDirs
    // if they're actually set.
    for (const multiRootDir of rootDirs ?? []) {
      candidates.push(path.resolve(this.basePath, multiRootDir, relativePath))
    }

    return candidates
  }

  registerRelatedSourceFile (file: SourceFile) {
    this.relatedSourceFiles.push(file)
  }
}
