import { FileMatch } from './match'

export interface FileLoaderOptions {
  match?: FileMatch
}

export abstract class FileLoader {
  protected fileMatcher: FileMatch

  constructor (options?: FileLoaderOptions) {
    this.fileMatcher = options?.match ?? FileMatch.any()
  }

  /**
   * Checks whether the FileLoader can be used for a file path.
   *
   * @param filePath The file path to evaluate.
   * @returns Whether the FileLoader is authoritative for the file path.
   */
  isAuthoritativeFor (filePath: string): boolean {
    return this.fileMatcher.match(filePath)
  }

  /**
   * Loads a file.
   *
   * @param filePath The path to load the file from.
   * @returns The unmodified exports of the file.
   */
  abstract loadFile<T = unknown> (filePath: string): Promise<T>
}

/**
 * Error thrown when a FileLoader is authoritative for a file path but
 * fails to load it.
 */
export class UnsupportedFileLoaderError extends Error {
  constructor (message = 'File cannot be loaded by this loader', options?: ErrorOptions) {
    super(message, options)
    this.name = 'UnsupportedFileLoaderError'
  }
}
