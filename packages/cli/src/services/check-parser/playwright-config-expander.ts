import fs from 'node:fs/promises'
import * as path from 'node:path'
import url from 'node:url'

import { minimatch } from 'minimatch'

import { findFilesWithPattern, pathToPosix } from '../util.js'
import { PlaywrightConfig } from '../playwright-config.js'

export interface FindTestFilesOptions {
  /**
   * The directory the code bundle is rooted at. When given, discovered paths
   * are reconciled into its spelling, and a file outside it is an error. When
   * absent (e.g. the standalone config debugging command), paths are returned
   * as discovered.
   */
  bundleRoot?: string
}

export class PlaywrightConfigExpander {
  /**
   * Keyed by config instance rather than config path: two instances can share a
   * canonical path while differing in the spellings they were reached through,
   * and the result depends on those spellings via the reconciliation fallback.
   */
  #cache = new WeakMap<PlaywrightConfig, Map<string, Promise<string[]>>>()

  private async collectFiles (cache: Map<string, string[]>, testDir: string, ignoredFiles: string[]) {
    let files = cache.get(testDir)
    if (!files) {
      files = await findFilesWithPattern(testDir, '**/*.{js,ts,mjs}', ignoredFiles)
      cache.set(testDir, files)
    }
    return files
  }

  async #findTestFiles (playwrightConfig: PlaywrightConfig, options: FindTestFilesOptions): Promise<string[]> {
    const ignoredFiles = ['**/node_modules/**', '.git/**']
    const cachedFiles = new Map<string, string[]>()
    // If projects is definited, ignore root settings
    const projects = playwrightConfig.projects ?? [playwrightConfig]
    const found = new Set<string>()
    // The config file itself travels with the bundle, and its (canonical) path
    // needs the same root-spelling reconciliation as everything else here.
    found.add(playwrightConfig.configFilePath)
    playwrightConfig.files.forEach(file => found.add(file))
    for (const project of projects) {
      // Cache the files by test dir
      const files = await this.collectFiles(cachedFiles, project.testDir, ignoredFiles)
      const matcher = this.createFileMatcher(Array.from(project.testMatch))
      for (const file of files) {
        if (!matcher(file)) {
          continue
        }
        found.add(file)
        const snapshotGlobs = project.getSnapshotPath(file).map(snapshotPath => pathToPosix(snapshotPath))
        const snapshots = await findFilesWithPattern(project.testDir, snapshotGlobs, ignoredFiles)
        if (snapshots.length) {
          snapshots.forEach(file => found.add(file))
        }
      }
    }
    return await this.#reconcile(Array.from(found), playwrightConfig, options)
  }

  /**
   * Re-expresses discovered paths in the bundle root's own spelling.
   *
   * The config canonicalizes every path it names, so discovery works in the
   * canonical namespace — but everything downstream measures paths against the
   * bundle root as the caller spelled it. The two differ whenever the root is
   * reached through a symlink (macOS /tmp, a config dir given via a linked
   * path). Left unreconciled, a canonical path against a differently-spelled
   * root escapes it: the parser's directory walks run past the project, and
   * archive entries get `..`-prefixed names.
   *
   * Canonicalization stops at the bundle's edge. When a config-named path's
   * canonical location is outside the root but its spelling is inside — a
   * testDir reached through a link that points out of the project — the files
   * are bundled at the spelling instead: the spelled tree extracts as ordinary
   * directories, which is what such projects relied on before, and there is no
   * in-root canonical location to prefer.
   *
   * A file outside the root under both spellings cannot be represented in the
   * bundle at all, so it fails loudly. Previously such files were silently
   * dropped or archived at `..`-escaping names that never extracted — failure
   * either way, just later and quieter.
   */
  async #reconcile (
    files: string[],
    playwrightConfig: PlaywrightConfig,
    options: FindTestFilesOptions,
  ): Promise<string[]> {
    const { bundleRoot } = options
    if (bundleRoot === undefined) {
      return files
    }

    let realRoot: string
    try {
      realRoot = await fs.realpath(bundleRoot)
    } catch {
      realRoot = bundleRoot
    }

    const inRoot = (file: string) =>
      file === bundleRoot || file.startsWith(bundleRoot + path.sep)
      || file === realRoot || file.startsWith(realRoot + path.sep)

    // Spellings whose canonical location left the root, for the fallback above:
    // a file under such a canonical prefix is re-expressed under the spelling.
    // Longest canonical prefix first, so that when one out-of-root target nests
    // inside another (a snapshotDir inside a linked testDir's target), the most
    // specific spelling claims the file.
    const spelledFallbacks = Array.from(playwrightConfig.referencedPaths)
      .filter(([spelled, canonical]) =>
        spelled !== canonical && inRoot(spelled) && !inRoot(canonical))
      .sort(([, a], [, b]) => b.length - a.length)

    return files.map(file => {
      if (file === bundleRoot || file.startsWith(bundleRoot + path.sep)) {
        return file
      }

      if (file === realRoot || file.startsWith(realRoot + path.sep)) {
        return path.join(bundleRoot, path.relative(realRoot, file))
      }

      for (const [spelled, canonical] of spelledFallbacks) {
        if (file === canonical || file.startsWith(canonical + path.sep)) {
          return path.join(spelled, path.relative(canonical, file))
        }
      }

      throw new Error(
        `${file} is outside the project's bundle root (${bundleRoot}) and cannot be included `
        + `in the code bundle. The bundle root is your workspace root, or the nearest package.json `
        + `directory when the project is not part of a workspace — if this file belongs to your `
        + `monorepo, make sure the package containing your Checkly config is listed in the `
        + `workspace configuration. Otherwise, move the file inside the project, or adjust `
        + `testDir and related settings.`,
      )
    })
  }

  async findTestFiles (playwrightConfig: PlaywrightConfig, options: FindTestFilesOptions = {}): Promise<string[]> {
    let byRoot = this.#cache.get(playwrightConfig)
    if (byRoot === undefined) {
      byRoot = new Map<string, Promise<string[]>>()
      this.#cache.set(playwrightConfig, byRoot)
    }

    const cacheKey = options.bundleRoot ?? ''
    const cached = byRoot.get(cacheKey)
    if (cached !== undefined) {
      return await cached
    }
    // Cache the in-flight promise (not the resolved value) so that many checks
    // sharing one Playwright config walk the filesystem once instead of once
    // per check when they bundle concurrently.
    const promise = this.#findTestFiles(playwrightConfig, options)
    byRoot.set(cacheKey, promise)
    return await promise
  }

  private createFileMatcher (patterns: (string | RegExp)[]): (filePath: string) => boolean {
    const reList: RegExp[] = []
    const filePatterns: string[] = []
    for (const pattern of patterns) {
      if (pattern instanceof RegExp) {
        reList.push(pattern)
      } else {
        if (!pattern.startsWith('**/')) {
          filePatterns.push('**/' + pattern)
        } else {
          filePatterns.push(pattern)
        }
      }
    }
    return (filePath: string) => {
      for (const re of reList) {
        re.lastIndex = 0
        if (re.test(filePath)) {
          return true
        }
      }
      // Windows might still receive unix style paths from Cygwin or Git Bash.
      // Check against the file url as well.
      if (path.sep === '\\') {
        const fileURL = url.pathToFileURL(filePath).href
        for (const re of reList) {
          re.lastIndex = 0
          if (re.test(fileURL)) {
            return true
          }
        }
      }
      for (const pattern of filePatterns) {
        if (minimatch(filePath, pattern, { nocase: true, dot: true })) {
          return true
        }
      }
      return false
    }
  }
}
