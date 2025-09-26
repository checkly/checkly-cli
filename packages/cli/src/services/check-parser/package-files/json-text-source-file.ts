import { JsonSourceFile } from './json-source-file'
import { JsonTextSourceFileParser } from './json-text-source-file-parser'
import { SourceFile } from './source-file'

export class JsonTextSourceFile<Schema> extends JsonSourceFile<Schema> {
  static #parser = new JsonTextSourceFileParser()

  static async loadFromSourceFile<Schema> (sourceFile: SourceFile): Promise<JsonTextSourceFile<Schema> | undefined> {
    try {
      const data: Schema = await this.#parser.parseSourceFile(sourceFile)

      return new JsonTextSourceFile(sourceFile, data)
    } catch {
      // Ignore.
    }
  }

  static reset () {
    JsonTextSourceFileParser.reset()
  }
}
