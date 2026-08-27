import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import Debug from 'debug'

import { IntegrityHash, integrityHashToHex, strongestIntegrityHash, verifyIntegrity } from './integrity.js'

const debug = Debug('checkly:cli:services:embedded-packages')

function platformCacheDir (
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homedir: string,
): string {
  switch (platform) {
    case 'darwin':
      return path.join(homedir, 'Library', 'Caches', 'checkly')
    case 'win32': {
      const localAppData = env.LOCALAPPDATA !== undefined && env.LOCALAPPDATA !== ''
        ? env.LOCALAPPDATA
        : path.join(homedir, 'AppData', 'Local')
      return path.join(localAppData, 'checkly', 'Cache')
    }
    default: {
      const xdgCacheHome = env.XDG_CACHE_HOME
      const cacheHome = xdgCacheHome !== undefined && xdgCacheHome !== ''
        ? xdgCacheHome
        : path.join(homedir, '.cache')
      return path.join(cacheHome, 'checkly')
    }
  }
}

/**
 * The Checkly CLI's cache directories, in precedence order. A
 * `CHECKLY_CACHE_DIR` override is the sole location. Otherwise the primary
 * is the project-local `node_modules/.cache/checkly` (the conventional
 * tool-cache location — incremental installs leave it alone, and CI setups
 * that cache `node_modules` persist it automatically), backed by a
 * per-user platform cache directory (macOS: `~/Library/Caches/checkly`,
 * Windows: `%LOCALAPPDATA%\checkly\Cache`, elsewhere:
 * `$XDG_CACHE_HOME/checkly` or `~/.cache/checkly`) that serves as a read
 * tier and as the write fallback when the project location isn't writable
 * (e.g. a read-only checkout).
 */
export function resolveCacheDirs (
  env: NodeJS.ProcessEnv = process.env,
  projectRoot?: string,
  platform: NodeJS.Platform = process.platform,
  homedir = os.homedir(),
): string[] {
  const override = env.CHECKLY_CACHE_DIR
  if (override !== undefined && override !== '') {
    return [path.resolve(override)]
  }

  const dirs = []
  if (projectRoot !== undefined) {
    dirs.push(path.join(projectRoot, 'node_modules', '.cache', 'checkly'))
  }
  dirs.push(platformCacheDir(env, platform, homedir))
  return [...new Set(dirs)]
}

/**
 * A content-addressed store of package tarballs, keyed by the lockfile's
 * integrity hash, spread over one or more root directories in precedence
 * order (typically the project-local cache backed by the per-user one).
 * Reads consult every root and verify the content, so a corrupt entry
 * degrades to a cache miss rather than a user-facing error. Writes go to
 * the first root that accepts them, so an unwritable project tree falls
 * back to the per-user cache instead of failing — unless the unwritable
 * root already holds a verifying entry, which satisfies the write as-is.
 */
export class TarballCache {
  #rootDirs: string[]

  constructor (rootDirs: string | string[]) {
    this.#rootDirs = Array.isArray(rootDirs) ? rootDirs : [rootDirs]
  }

  static default (
    env: NodeJS.ProcessEnv = process.env,
    projectRoot?: string,
    platform: NodeJS.Platform = process.platform,
    homedir = os.homedir(),
  ): TarballCache {
    return new TarballCache(resolveCacheDirs(env, projectRoot, platform, homedir)
      .map(dir => path.join(dir, 'embedded-packages')))
  }

  #pathFor (rootDir: string, hash: IntegrityHash): string {
    const hex = integrityHashToHex(hash)
    return path.join(rootDir, hash.algorithm, hex.slice(0, 2), `${hex.slice(2)}.tgz`)
  }

  /**
   * Returns the path of a cached, integrity-verified tarball, or undefined
   * on a miss. A file that fails verification is deleted best-effort.
   */
  async get (integrity: string): Promise<string | undefined> {
    const hash = strongestIntegrityHash(integrity)
    if (hash === undefined) {
      return undefined
    }

    for (const rootDir of this.#rootDirs) {
      const filePath = this.#pathFor(rootDir, hash)

      let content: Buffer
      try {
        content = await fs.readFile(filePath)
      } catch {
        continue
      }

      if (!verifyIntegrity(content, integrity)) {
        await fs.rm(filePath, { force: true }).catch(() => {})
        continue
      }

      return filePath
    }

    return undefined
  }

  /**
   * Stores verified tarball content in the first writable root and returns
   * its path. The write is atomic (temp file + rename), so concurrent
   * processes sharing the cache never observe a torn file — and because
   * the store is content-addressed, losing a write race is itself a
   * success: a write that fails while the destination already holds
   * content matching the integrity returns that entry instead of erroring.
   * The caller is responsible for verifying the content against the
   * lockfile integrity beforehand.
   */
  async put (integrity: string, content: Buffer): Promise<string> {
    const hash = strongestIntegrityHash(integrity)
    if (hash === undefined) {
      throw new Error(`Cannot cache a tarball without a supported integrity hash ('${integrity}')`)
    }

    let lastError: unknown
    for (const [index, rootDir] of this.#rootDirs.entries()) {
      const filePath = this.#pathFor(rootDir, hash)
      const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(tempPath, content)
        await fs.rename(tempPath, filePath)
        if (index > 0) {
          debug('cache write fell back to %s', rootDir)
        }
        return filePath
      } catch (err) {
        // Concurrent writers race onto the same content-addressed path —
        // two same-integrity puts in this process, or another process
        // sharing the cache. POSIX rename silently replaces, but on
        // Windows the losing rename fails with EPERM while the winner
        // still holds the destination open. Whatever failed, a
        // destination that verifies means the content is cached, which is
        // all a put promises. The recovery read is deliberately
        // single-shot and best-effort: retrying would add fixed latency to
        // every genuinely unwritable root (the common non-race case), so a
        // read that itself hits a transient lock falls through to the
        // normal failure path instead.
        const existing = await fs.readFile(filePath).catch(() => undefined)
        if (existing !== undefined && verifyIntegrity(existing, integrity)) {
          debug('cache write under %s failed (%s), but the destination already verifies',
            rootDir, (err as Error).message)
          return filePath
        }
        debug('cache write under %s failed: %s', rootDir, (err as Error).message)
        lastError = err
      } finally {
        await fs.rm(tempPath, { force: true }).catch(() => {})
      }
    }

    throw new Error(
      `Unable to write the embedded-packages cache`
      + ` (tried ${this.#rootDirs.map(dir => `'${dir}'`).join(', ')}):`
      + ` ${(lastError as Error | undefined)?.message ?? 'unknown error'}.`
      + ` Set CHECKLY_CACHE_DIR to a writable directory to override the cache location.`,
      { cause: lastError },
    )
  }
}

/**
 * Looks up a tarball in npm's cache (cacache), which stores raw registry
 * tarballs content-addressed by the same sha512 the lockfile records, at
 * `content-v2/sha512/<hex[0:2]>/<hex[2:4]>/<hex[4:]>`. Returns verified
 * content, or undefined when absent, unverifiable, or keyed by an
 * algorithm other than sha512. Read-only: npm's cache is never written to.
 */
export async function lookupNpmCacache (
  integrity: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  homedir = os.homedir(),
): Promise<Buffer | undefined> {
  const hash = strongestIntegrityHash(integrity)
  if (hash === undefined || hash.algorithm !== 'sha512') {
    return undefined
  }

  const npmCacheDir = env.npm_config_cache !== undefined && env.npm_config_cache !== ''
    ? env.npm_config_cache
    : platform === 'win32'
      ? path.join(
          env.LOCALAPPDATA !== undefined && env.LOCALAPPDATA !== ''
            ? env.LOCALAPPDATA
            : path.join(homedir, 'AppData', 'Local'),
          'npm-cache',
        )
      : path.join(homedir, '.npm')

  const hex = integrityHashToHex(hash)
  const contentPath = path.join(
    npmCacheDir, '_cacache', 'content-v2', 'sha512',
    hex.slice(0, 2), hex.slice(2, 4), hex.slice(4),
  )

  let content: Buffer
  try {
    content = await fs.readFile(contentPath)
  } catch {
    return undefined
  }

  if (!verifyIntegrity(content, integrity)) {
    return undefined
  }

  return content
}
