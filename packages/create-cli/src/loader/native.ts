import { FileLoader, FileLoaderOptions } from './loader'
import { FileMatch } from './match'

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
