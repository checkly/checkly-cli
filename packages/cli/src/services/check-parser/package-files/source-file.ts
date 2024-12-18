import fs from 'node:fs'
import path from 'node:path'

export class FileMeta {
  filePath: string
  dirname: string
  basename: string

  private constructor (filePath: string, dirname: string, basename: string) {
    this.filePath = filePath
    this.dirname = dirname
    this.basename = basename
  }

  static fromFilePath (filePath: string): FileMeta {
    return new FileMeta(
      filePath,
      path.dirname(filePath),
      path.basename(filePath),
    )
  }
}

export class SourceFile {
  contents: string
  meta: FileMeta

  private constructor (meta: FileMeta, contents: string) {
    this.meta = meta
    this.contents = contents
  }

  static loadFromFilePath (filePath: string, suffixes?: string[]): SourceFile | undefined {
    for (const suffix of ['', ...suffixes ?? []]) {
      try {
        const suffixFilePath = filePath + suffix

        const contents = fs.readFileSync(suffixFilePath, {
          encoding: 'utf8',
        })

        const meta = FileMeta.fromFilePath(suffixFilePath)

        return new SourceFile(meta, contents)
      } catch (err: any) {
      }
    }
  }
}
