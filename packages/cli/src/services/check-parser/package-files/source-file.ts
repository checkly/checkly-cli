import fs from 'node:fs/promises'
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
  static #id = 0
  readonly id = ++SourceFile.#id

  contents: string
  meta: FileMeta

  constructor (meta: FileMeta, contents: string) {
    this.meta = meta
    this.contents = contents
  }

  static async loadFromFilePath (filePath: string): Promise<SourceFile | undefined> {
    try {
      const contents = await fs.readFile(filePath, {
        encoding: 'utf8',
      })

      const meta = FileMeta.fromFilePath(filePath)

      return new SourceFile(meta, contents)
    } catch {
      // Ignore.
    }
  }
}
