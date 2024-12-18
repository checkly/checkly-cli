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

  private constructor (jsonFile: JsonSourceFile<Schema>) {
    this.jsonFile = jsonFile
    this.basePath = jsonFile.meta.dirname
  }

  public get meta () {
    return this.jsonFile.meta
  }

  static loadFromJsonSourceFile (jsonFile: JsonSourceFile<Schema>): PackageJsonFile | undefined {
    return new PackageJsonFile(jsonFile)
  }

  static async loadFromFilePath (filePath: string, options?: Options): Promise<PackageJsonFile | undefined> {
    const { jsonSourceFileLoader } = {
      jsonSourceFileLoader: JsonSourceFile.loadFromFilePath<Schema>,
      ...options,
    }

    const jsonFile = await jsonSourceFileLoader(filePath)
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

  mainPath () {
    return path.resolve(this.meta.dirname, this.jsonFile.data.main ?? 'index.js')
  }
}
