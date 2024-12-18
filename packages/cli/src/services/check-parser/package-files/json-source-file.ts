import { SourceFile } from './source-file'
import type { LoadFile } from './loader'

export type Options = {
  sourceFileLoader?: LoadFile<SourceFile>,
}

export class JsonSourceFile<Schema> {
  sourceFile: SourceFile
  data: Schema

  private constructor (sourceFile: SourceFile, data: Schema) {
    this.sourceFile = sourceFile
    this.data = data
  }

  public get meta () {
    return this.sourceFile.meta
  }

  static loadFromSourceFile<Schema> (sourceFile: SourceFile): JsonSourceFile<Schema> | undefined {
    try {
      const data: Schema = JSON.parse(sourceFile.contents)

      return new JsonSourceFile(sourceFile, data)
    } catch (err: any) {
    }
  }

  static loadFromFilePath<Schema> (
    filePath: string,
    options?: Options,
  ): JsonSourceFile<Schema> | undefined {
    const { sourceFileLoader } = {
      sourceFileLoader: SourceFile.loadFromFilePath,
      ...options,
    }

    try {
      const sourceFile = sourceFileLoader(filePath)
      if (sourceFile === undefined) {
        return
      }

      return JsonSourceFile.loadFromSourceFile(sourceFile)
    } catch (err: any) {
    }
  }
}
