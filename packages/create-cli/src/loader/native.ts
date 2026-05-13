import { FileLoader, FileLoaderOptions } from './loader.js'
import { FileMatch } from './match.js'

export type NativeFileLoaderOptions = FileLoaderOptions

export class NativeFileLoader extends FileLoader {
  constructor (options?: NativeFileLoaderOptions) {
    super({
      match: FileMatch.standardFiles(),
      ...options,
    })
  }

  async loadFile<T = unknown> (filePath: string): Promise<T> {
    const moduleExports = await import(filePath)
    return moduleExports
  }
}
