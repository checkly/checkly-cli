import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let cachedRoot: string | undefined

function findRoot (start: string): string {
  let dir = start
  while (true) {
    const candidate = path.join(dir, 'package.json')
    if (existsSync(candidate)) {
      try {
        if (JSON.parse(readFileSync(candidate, 'utf8')).name === 'checkly') {
          return dir
        }
      } catch {
        // An unreadable package.json is not ours — keep walking up.
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(`Could not locate the checkly package root starting from ${start}`)
    }
    dir = parent
  }
}

/**
 * The checkly CLI's own package root, found by walking up from this module.
 *
 * Unlike a fixed number of `..` segments, this works no matter where the
 * module physically lives: the esbuild bundle in dist/bundle/, compiled tsc
 * output anywhere in dist/, TypeScript sources under src/ during development,
 * or a pnpm-style install where the package is a symlink target.
 *
 * Used to anchor paths to package assets (dist/ai-context, assets) that used
 * to be computed relative to the compiled module's own depth.
 */
export function packageRoot (): string {
  cachedRoot ??= findRoot(path.dirname(fileURLToPath(import.meta.url)))
  return cachedRoot
}
