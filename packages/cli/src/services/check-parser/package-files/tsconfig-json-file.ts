import path from 'node:path'

import { JsonSourceFile } from './json-source-file'
import { PathResolver } from './paths'
import type { LoadFile } from './loader'

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
}

export interface Schema {
  compilerOptions?: CompilerOptions
}

export type Options = {
  jsonSourceFileLoader?: LoadFile<JsonSourceFile<Schema>>,
}

export class TSConfigFile {
  static FILENAME = 'tsconfig.json'

  jsonFile: JsonSourceFile<Schema>
  basePath: string
  moduleResolution: string
  baseUrl?: string
  pathResolver: PathResolver

  private constructor (jsonFile: JsonSourceFile<Schema>) {
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

  static loadFromFilePath (filePath: string, options?: Options): TSConfigFile | undefined {
    const { jsonSourceFileLoader } = {
      jsonSourceFileLoader: JsonSourceFile.loadFromFilePath<Schema>,
      ...options,
    }

    const jsonFile = jsonSourceFileLoader(filePath)
    if (jsonFile === undefined) {
      return
    }

    return new TSConfigFile(jsonFile)
  }

  static filePath (dirPath: string) {
    return path.join(dirPath, TSConfigFile.FILENAME)
  }

  // This doesn't seem to actally be what TS does despite the docs claiming so.
  supportsPackageRelativePaths () {
    switch (this.moduleResolution) {
      case 'node':
        return true
      case 'node10':
        return true
    }
    return false
  }

  resolvePath (importPath: string): string[] {
    return this.pathResolver.resolve(importPath)
  }
}
