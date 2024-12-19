import path from 'node:path'

import { JsonSourceFile } from './json-source-file'
import type { LoadFile } from './loader'

type ExportCondition =
  'node-addons' | 'node' | 'import' | 'require' | 'module-sync' | 'default'

type Schema = {
  main?: string
  exports?: string | string[] | Record<string, string> | Record<ExportCondition, Record<string, string>>
}

export type Options = {
  jsonSourceFileLoader?: LoadFile<JsonSourceFile<Schema>>,
}

export class PackageJsonFile {
  static FILENAME = 'package.json'

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

  public get meta () {
    return this.jsonFile.meta
  }

  static loadFromJsonSourceFile (jsonFile: JsonSourceFile<Schema>): PackageJsonFile | undefined {
    return new PackageJsonFile(jsonFile)
  }

  static loadFromFilePath (filePath: string, options?: Options): PackageJsonFile | undefined {
    const { jsonSourceFileLoader } = {
      jsonSourceFileLoader: JsonSourceFile.loadFromFilePath<Schema>,
      ...options,
    }

    const jsonFile = jsonSourceFileLoader(filePath)
    if (jsonFile === undefined) {
      return
    }

    return new PackageJsonFile(jsonFile)
  }

  static filePath (dirPath: string) {
    return path.join(dirPath, PackageJsonFile.FILENAME)
  }

  supportsPackageRelativePaths () {
    return this.jsonFile.data.exports === undefined
  }
}
