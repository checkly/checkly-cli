import Debug from 'debug'

import { FileLoader, FileLoaderOptions, UnsupportedFileLoaderError } from './loader'
import { FileMatch } from './match'
import { preferenceDelta } from './config'

const debug = Debug('checkly:cli:loader:jiti')

interface JitiExports {
  createJiti (id: string, userOptions?: any): Jiti
}

interface Jiti {
  import<T = unknown> (
    id: string,
    opts?: { default?: true },
  ): Promise<T>
}

export class UninitializedJitiFileLoaderState extends FileLoader {
  private static init?: Promise<void>

  async loadFile<T = unknown> (filePath: string): Promise<T> {
    UninitializedJitiFileLoaderState.init ??= (async () => {
      debug('Initializing loader')
      try {
        const jitiExports: JitiExports = await import('jiti')
        const jiti = jitiExports.createJiti(__filename, {
          tsx: true,
        })
        debug(`Successfully initialized loader`)
        JitiFileLoader.state = new InitializedJitiFileLoaderState(jiti)
      } catch (err) {
        debug(`Failed to initialize loader: ${err}`)
        JitiFileLoader.state = new FailedJitiFileLoaderState(err as Error)
      }
    })()

    await UninitializedJitiFileLoaderState.init

    return await JitiFileLoader.state.loadFile(filePath)
  }
}

export class FailedJitiFileLoaderState extends FileLoader {
  error: Error

  constructor (error: Error) {
    super()
    this.error = error
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, require-await
  async loadFile<T = unknown> (filePath: string): Promise<T> {
    throw new UnsupportedFileLoaderError('JitiFileLoader is not supported', {
      cause: this.error,
    })
  }
}

export class InitializedJitiFileLoaderState extends FileLoader {
  jiti: Jiti

  constructor (jiti: Jiti) {
    super()
    this.jiti = jiti
  }

  async loadFile<T = unknown> (filePath: string): Promise<T> {
    debug(`Loading file ${filePath}`)
    try {
      const moduleExports = await this.jiti.import<T>(filePath)
      return moduleExports
    } catch (err) {
      debug(`Failed to load file ${filePath}: ${err}`)
      throw err
    }
  }
}

export type JitiFileLoaderOptions = FileLoaderOptions

export class JitiFileLoader extends FileLoader {
  static DEFAULT_PRIORITY = 500 + preferenceDelta('jiti')

  static state: FileLoader = new UninitializedJitiFileLoaderState()

  constructor (options?: JitiFileLoaderOptions) {
    super({
      match: FileMatch.standardFiles().complement(),
      priority: JitiFileLoader.DEFAULT_PRIORITY,
      ...options,
    })
  }

  async loadFile<T = unknown> (filePath: string): Promise<T> {
    return await JitiFileLoader.state.loadFile<T>(filePath)
  }
}
