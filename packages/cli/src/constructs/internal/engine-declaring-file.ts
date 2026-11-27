import type { EngineConfig } from '../engine.js'

/**
 * The file that wrote each engine's version, kept outside the `Engine` object
 * so that it never becomes part of a check's payload or of the public API.
 * An `Engine.node()` call records its caller; an engine written as a plain
 * object in the Checkly config file is recorded with that file.
 */
const declaringFiles = new WeakMap<EngineConfig, string>()

/** Records `file` for `engine`, unless the engine already has one. */
export function recordEngineDeclaringFile (engine: unknown, file: string | undefined): void {
  if (file === undefined || typeof engine !== 'object' || engine === null) {
    return
  }
  const key = engine as EngineConfig
  if (!declaringFiles.has(key)) {
    declaringFiles.set(key, file)
  }
}

/** The absolute path of the file that wrote `engine`'s version, when known. */
export function engineDeclaringFile (engine: EngineConfig): string | undefined {
  return declaringFiles.get(engine)
}
