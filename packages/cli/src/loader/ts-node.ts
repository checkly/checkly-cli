import Debug from 'debug'

import { preferenceDelta } from './config'
import { FileLoader, FileLoaderOptions, UnsupportedFileLoaderError } from './loader'
import { FileMatch } from './match'

const debug = Debug('checkly:cli:loader:ts-node')

interface TSNodeExports {
  register (opts?: any): TSNodeService
}

interface TSNodeService {
  enabled (enabled?: boolean): boolean
}

export class UninitializedTSNodeFileLoaderState extends FileLoader {
  private static init?: Promise<void>

  async loadFile<T = unknown> (filePath: string): Promise<T> {
    UninitializedTSNodeFileLoaderState.init ??= (async () => {
      debug('Initializing loader')
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
        debug(`Successfully initialized loader`)
        TSNodeFileLoader.state = new InitializedTSNodeFileLoaderState(service)
      } catch (err) {
        debug(`Failed to initialize loader: ${err}`)
        TSNodeFileLoader.state = new FailedTSNodeFileLoaderState(err as Error)
      }
    })()

    await UninitializedTSNodeFileLoaderState.init

    return await TSNodeFileLoader.state.loadFile(filePath)
  }
}

export class FailedTSNodeFileLoaderState extends FileLoader {
  error: Error

  constructor (error: Error) {
    super()
    this.error = error
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, require-await
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

  // eslint-disable-next-line require-await
  async loadFile<T = unknown> (filePath: string): Promise<T> {
    debug(`Loading file ${filePath}`)
    try {
      this.service.enabled(true)

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const moduleExports = require(filePath)
      return moduleExports
    } catch (err: any) {
      debug(`Failed to load file ${filePath}: ${err}`)

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
  static DEFAULT_PRIORITY = 500 + preferenceDelta('ts-node')

  static state: FileLoader = new UninitializedTSNodeFileLoaderState()

  constructor (options?: TSNodeFileLoaderOptions) {
    super({
      match: FileMatch.standardFiles().complement(),
      priority: TSNodeFileLoader.DEFAULT_PRIORITY,
      ...options,
    })
  }

  async loadFile<T = unknown> (filePath: string): Promise<T> {
    return await TSNodeFileLoader.state.loadFile<T>(filePath)
  }
}
