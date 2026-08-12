import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { IntegrityHash, integrityHashToHex, strongestIntegrityHash, verifyIntegrity } from './integrity.js'

/**
 * The Checkly CLI's per-user cache directory. `CHECKLY_CACHE_DIR` overrides
 * the platform default (macOS: `~/Library/Caches/checkly`, Windows:
 * `%LOCALAPPDATA%\checkly\Cache`, elsewhere: `$XDG_CACHE_HOME/checkly` or
 * `~/.cache/checkly`).
 */
export function resolveCacheDir (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  homedir = os.homedir(),
): string {
  const override = env.CHECKLY_CACHE_DIR
  if (override !== undefined && override !== '') {
    return path.resolve(override)
  }

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
 * A content-addressed store of package tarballs under the CLI cache
 * directory, keyed by the lockfile's integrity hash. Every read verifies
 * the content, so a corrupt entry degrades to a cache miss rather than a
 * user-facing error.
 */
export class TarballCache {
  #rootDir: string

  constructor (rootDir: string) {
    this.#rootDir = rootDir
  }

  static default (
    env: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
    homedir = os.homedir(),
  ): TarballCache {
    return new TarballCache(path.join(resolveCacheDir(env, platform, homedir), 'embedded-packages'))
  }

  #pathFor (hash: IntegrityHash): string {
    const hex = integrityHashToHex(hash)
    return path.join(this.#rootDir, hash.algorithm, hex.slice(0, 2), `${hex.slice(2)}.tgz`)
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
    const filePath = this.#pathFor(hash)

    let content: Buffer
    try {
      content = await fs.readFile(filePath)
    } catch {
      return undefined
    }

    if (!verifyIntegrity(content, integrity)) {
      await fs.rm(filePath, { force: true }).catch(() => {})
      return undefined
    }

    return filePath
  }

  /**
   * Stores verified tarball content and returns its path. The write is
   * atomic (temp file + rename), so concurrent processes sharing the cache
   * never observe a torn file. The caller is responsible for verifying the
   * content against the lockfile integrity beforehand.
   */
  async put (integrity: string, content: Buffer): Promise<string> {
    const hash = strongestIntegrityHash(integrity)
    if (hash === undefined) {
      throw new Error(`Cannot cache a tarball without a supported integrity hash ('${integrity}')`)
    }
    const filePath = this.#pathFor(hash)

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(tempPath, content)
      await fs.rename(tempPath, filePath)
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => {})
    }

    return filePath
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
