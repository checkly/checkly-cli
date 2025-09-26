import { SourceFile } from './source-file'

export abstract class SourceFileParser {
  abstract parseSourceFile<T = unknown> (sourceFile: SourceFile): Promise<T>
}
export type SourceFileParserFunc = <T = unknown> (sourceFile: SourceFile) => Promise<T>

export class SourceFileParserFuncState extends SourceFileParser {
  parser: SourceFileParserFunc

  constructor (parser: SourceFileParserFunc) {
    super()
    this.parser = parser
  }

  async parseSourceFile<T = unknown> (sourceFile: SourceFile): Promise<T> {
    return await this.parser<T>(sourceFile)
  }
}
