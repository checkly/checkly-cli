import { FileMeta, SourceFile } from './source-file'
import { SourceFileParserFuncState, SourceFileParser } from './source-file-parser'

class UninitializedJsonTextSourceFileParserState extends SourceFileParser {
  private static init?: Promise<void>

  async #parser (): Promise<SourceFileParser> {
    try {
      const typescriptExports = await import('typescript')
      const { parseJsonText, convertToObject } = typescriptExports.default

      const parser = new SourceFileParserFuncState(<T>(sourceFile: SourceFile) => {
        const errors: any[] = []
        const parsed = parseJsonText(sourceFile.meta.filePath, sourceFile.contents)
        const object: T = convertToObject(parsed, errors)
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
