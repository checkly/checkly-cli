import { SourceFile } from './source-file'

export class JsonSourceFile<Schema> {
  static #id = 0
  readonly id = ++JsonSourceFile.#id

  sourceFile: SourceFile
  data: Schema

  constructor (sourceFile: SourceFile, data: Schema) {
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
    } catch {
      // Ignore.
    }
  }
}
