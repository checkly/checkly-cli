import { FileMeta, SourceFile } from './source-file.js'
import { SourceFileParserFuncState, SourceFileParser } from './source-file-parser.js'

class UninitializedJsonTextSourceFileParserState extends SourceFileParser {
  private static init?: Promise<void>

  async #parser (): Promise<SourceFileParser> {
    try {
      // JSON5 accepts the comments and trailing commas that tsconfig.json and
      // jsconfig.json files may contain. Unlike TypeScript's own JSON parser,
      // it works regardless of the project's TypeScript version.
      const { default: JSON5 } = await import('json5')

      const parser = new SourceFileParserFuncState(<T>(sourceFile: SourceFile) => {
        const object: T = JSON5.parse(sourceFile.contents)
        return object
      })

      // Make sure it actually works.
      await parser.parseSourceFile(new SourceFile(
        FileMeta.fromFilePath('x.json'),
        '{} // Comment',
      ))

      return parser
    } catch {
      return new SourceFileParserFuncState(<T>(sourceFile: SourceFile) => {
        const data: T = JSON.parse(sourceFile.contents)
        return data
      })
    }
  }

  async parseSourceFile<T = unknown> (sourceFile: SourceFile): Promise<T> {
    UninitializedJsonTextSourceFileParserState.init ??= (async () => {
      JsonTextSourceFileParser.state = await this.#parser()
    })()

    await UninitializedJsonTextSourceFileParserState.init

    return await JsonTextSourceFileParser.state.parseSourceFile(sourceFile)
  }

  static reset () {
    UninitializedJsonTextSourceFileParserState.init = undefined
  }
}

export class JsonTextSourceFileParser extends SourceFileParser {
  static state: SourceFileParser = new UninitializedJsonTextSourceFileParserState()

  async parseSourceFile<T = unknown> (sourceFile: SourceFile): Promise<T> {
    return await JsonTextSourceFileParser.state.parseSourceFile<T>(sourceFile)
  }

  static reset () {
    JsonTextSourceFileParser.state = new UninitializedJsonTextSourceFileParserState()
    UninitializedJsonTextSourceFileParserState.reset()
  }
}
