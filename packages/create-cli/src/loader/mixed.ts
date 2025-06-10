import {
  FileLoader,
  UnsupportedFileLoaderError,
} from './loader'

export class MixedFileLoader extends FileLoader {
  loaders: Set<FileLoader>

  constructor (...loaders: FileLoader[]) {
    super()
    this.loaders = new Set(loaders)
  }

  isAuthoritativeFor (filePath: string): boolean {
    for (const loader of this.loaders) {
      if (loader.isAuthoritativeFor(filePath)) {
        return true
      }
    }

    return false
  }

  async loadFile<T = unknown> (filePath: string): Promise<T> {
    for (const loader of this.loaders) {
      if (loader.isAuthoritativeFor(filePath)) {
        try {
          return await loader.loadFile<T>(filePath)
        } catch (err) {
          if (err instanceof UnsupportedFileLoaderError) {
            // We'll always get the same error. Just remove the loader to
            // avoid calling it again.
            this.loaders.delete(loader)
            continue
          }

          throw err
        }
      }
    }

    throw new UnsupportedFileLoaderError(
      `Unable to find authoritative loader for file '${filePath}'`,
    )
  }
}
