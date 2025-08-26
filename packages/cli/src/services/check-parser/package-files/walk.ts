import { resolve, dirname } from 'node:path'

export interface WalkUpOptions extends LineageOptions {
  isDir?: boolean
}

export async function walkUp (
  filePath: string,
  find: (dirPath: string) => Promise<boolean>,
  options?: WalkUpOptions,
): Promise<boolean> {
  let startPath = filePath

  if (options?.isDir !== true) {
    startPath = dirname(startPath)
  }

  for (const dirPath of lineage(startPath, options)) {
    const found = await find(dirPath)
    if (found) {
      return true
    }
  }

  return false
}

export interface LineageOptions {
  root?: string
}

export function* lineage (path: string, options?: LineageOptions): Generator<string, void> {
  let currentPath = resolve(path)

  const stopRoot = options?.root && resolve(options.root)

  // Lineage includes the starting path itself.
  yield currentPath

  while (true) {
    const prevPath = currentPath

    // Stop if we reach the user-specified root directory.
    // TODO: I don't like a string comparison for this but it'll do for now.
    if (prevPath === stopRoot) {
      return
    }

    currentPath = dirname(prevPath)

    // Bail out if we reach root.
    if (prevPath === currentPath) {
      return
    }

    yield currentPath
  }
}
