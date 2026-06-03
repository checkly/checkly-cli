import * as path from 'node:path'
import url from 'node:url'

import { minimatch } from 'minimatch'

import { findFilesWithPattern, pathToPosix } from '../util.js'
import { PlaywrightConfig } from '../playwright-config.js'

export class PlaywrightConfigExpander {
  #cache = new Map<string, Promise<string[]>>()

  private async collectFiles (cache: Map<string, string[]>, testDir: string, ignoredFiles: string[]) {
    let files = cache.get(testDir)
    if (!files) {
      files = await findFilesWithPattern(testDir, '**/*.{js,ts,mjs}', ignoredFiles)
      cache.set(testDir, files)
    }
    return files
  }

  async #findTestFiles (playwrightConfig: PlaywrightConfig): Promise<string[]> {
    const ignoredFiles = ['**/node_modules/**', '.git/**']
    const cachedFiles = new Map<string, string[]>()
    // If projects is definited, ignore root settings
    const projects = playwrightConfig.projects ?? [playwrightConfig]
    const found = new Set<string>()
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
    return Array.from(found)
  }

  async findTestFiles (playwrightConfig: PlaywrightConfig): Promise<string[]> {
    const cacheKey = playwrightConfig.configFilePath
    const cached = this.#cache.get(cacheKey)
    if (cached !== undefined) {
      return await cached
    }
    // Cache the in-flight promise (not the resolved value) so that many checks
    // sharing one Playwright config walk the filesystem once instead of once
    // per check when they bundle concurrently.
    const promise = this.#findTestFiles(playwrightConfig)
    this.#cache.set(cacheKey, promise)
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
