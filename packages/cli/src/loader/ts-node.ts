import { FileLoader, FileLoaderOptions, UnsupportedFileLoaderError } from './loader'
import { FileMatch } from './match'

interface TSNodeExports {
  register (opts?: any): TSNodeService
}

interface TSNodeService {
  enabled (enabled?: boolean): boolean
}

export class UninitializedTSNodeFileLoaderState extends FileLoader {
  init?: Promise<void>

  async loadFile<T = unknown> (filePath: string): Promise<T> {
    this.init ??= (async () => {
      try {
        const tsNodeExports: TSNodeExports = await import('ts-node')
        const service = tsNodeExports.register({
          moduleTypes: {
            '**/*': 'cjs',
          },
          compilerOptions: {
            module: 'CommonJS',
          },
        })
        TSNodeFileLoader.state = new InitializedTSNodeFileLoaderState(service)
      } catch (err) {
        TSNodeFileLoader.state = new FailedTSNodeFileLoaderState(err as Error)
      }
    })()

    await this.init

    return await TSNodeFileLoader.state.loadFile(filePath)
  }
}

export class FailedTSNodeFileLoaderState extends FileLoader {
  error: Error

  constructor (error: Error) {
    super()
    this.error = error
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async loadFile<T = unknown> (filePath: string): Promise<T> {
    throw new UnsupportedFileLoaderError('TSNodeFileLoader is not supported', {
      cause: this.error,
    })
  }
}

export class InitializedTSNodeFileLoaderState extends FileLoader {
  service: TSNodeService

  constructor (service: TSNodeService) {
    super()
    this.service = service
  }

  async loadFile<T = unknown> (filePath: string): Promise<T> {
    try {
      this.service.enabled(true)

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const moduleExports = require(filePath)
      return moduleExports
    } catch (err: any) {
      if (err.message?.includes('Unable to compile TypeScript')) {
        throw new Error(`Unable to load file '${filePath}' with 'ts-node' (hint: consider installing 'jiti' for improved TypeScript support)\n${err.stack}`, {
          cause: err as Error,
        })
      }

      throw err
    } finally {
      this.service.enabled(false)
    }
  }
}

export type TSNodeFileLoaderOptions = FileLoaderOptions

export class TSNodeFileLoader extends FileLoader {
  static state: FileLoader = new UninitializedTSNodeFileLoaderState()

  constructor (options?: TSNodeFileLoaderOptions) {
    super({
      match: FileMatch.standardFiles().complement(),
      ...options,
    })
  }

  async loadFile<T = unknown> (filePath: string): Promise<T> {
    return TSNodeFileLoader.state.loadFile<T>(filePath)
  }
}
