import JSON5 from 'json5'

import { JsonSourceFile } from './json-source-file.js'
import { SourceFile } from './source-file.js'

export class JsonTextSourceFile<Schema> extends JsonSourceFile<Schema> {
  // JSON5 accepts the comments and trailing commas that tsconfig.json and
  // jsconfig.json files may contain, regardless of the project's TypeScript
  // version.
  // eslint-disable-next-line require-await
  static async loadFromSourceFile<Schema> (sourceFile: SourceFile): Promise<JsonTextSourceFile<Schema> | undefined> {
    try {
      const data: Schema = JSON5.parse(sourceFile.contents)

      return new JsonTextSourceFile(sourceFile, data)
    } catch {
      // Ignore.
    }
  }
}
