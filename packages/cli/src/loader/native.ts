import { BunDetector, DenoDetector } from '../services/check-parser/package-files/package-manager.js'
import { pathToPosix } from '../services/util.js'
import { FileLoader, FileLoaderOptions } from './loader.js'
import { FileMatch } from './match.js'

export { BunDetector, DenoDetector }

export function detectNativeTypeScriptSupport (): boolean {
  if (new BunDetector().detectRuntime()) {
    return true
  }

  if (new DenoDetector().detectRuntime()) {
    return true
  }

  return false
}

export const hasNativeTypeScriptSupport = detectNativeTypeScriptSupport()

export type NativeFileLoaderOptions = FileLoaderOptions

export class NativeFileLoader extends FileLoader {
  constructor (options?: NativeFileLoaderOptions) {
    super({
      match: hasNativeTypeScriptSupport
        ? FileMatch.any()
        : FileMatch.standardFiles(),
      ...options,
    })
  }

  async loadFile<T = unknown> (filePath: string): Promise<T> {
    const moduleExports = await import(pathToPosix(filePath))
    return moduleExports
  }
}
