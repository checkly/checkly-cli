import { createRequire } from 'node:module'
import path from 'node:path'

import semver from 'semver'

import { File } from './check-parser/parser.js'
import { detectNearestPackageJson, PackageManager } from './check-parser/package-files/package-manager.js'
import { PlaywrightConfig } from './playwright-config.js'
import { findFilesWithPattern, pathToPosix } from './util.js'
import { Session } from '../constructs/session.js'

export interface PlaywrightProjectBundle {
  browsers: string[]
  relativePlaywrightConfigPath: string
  playwrightVersion: string
  workingDir?: string
  files: File[]
}

export class PlaywrightProjectBundler {
  // Cache the in-flight bundle promise keyed by (config, include). Many checks
  // are generated from one shared Playwright codebase, so they call bundle()
  // with identical arguments; without this each call would re-load the config
  // module, re-resolve the Playwright version, and re-glob the project
  // directory. Caching the promise (not the resolved value) also collapses
  // concurrent callers onto a single computation. The NUL separator keeps the
  // config path and the serialized include patterns from colliding.
  #cache = new Map<string, Promise<PlaywrightProjectBundle>>()

  async bundle (playwrightConfig: string, include: string[]): Promise<PlaywrightProjectBundle> {
    const cacheKey = `${playwrightConfig}\0${JSON.stringify(include)}`
    const cached = this.#cache.get(cacheKey)
    if (cached !== undefined) {
      return await cached
    }
    const promise = this.bundleProject(playwrightConfig, include)
    this.#cache.set(cacheKey, promise)
    return await promise
  }

  // The actual bundling, separated from the cache wrapper above so it can be
  // overridden in tests. Not part of the public surface.
  protected async bundleProject (playwrightConfig: string, include: string[]): Promise<PlaywrightProjectBundle> {
    const dir = path.resolve(path.dirname(playwrightConfig))
    const filePath = path.resolve(dir, playwrightConfig)

    // No need of loading everything if there is no lockfile
    const pwtConfig = await Session.loadFile(filePath)

    const pwConfigParsed = new PlaywrightConfig(filePath, pwtConfig)

    const playwrightVersion = await getPlaywrightVersionFromPackage(dir)

    const parser = Session.getPlaywrightParser()
    const { files, errors } = await parser.getFilesAndDependencies(pwConfigParsed)
    if (errors.length) {
      throw new Error(`Error loading playwright project files: ${errors.map((e: string) => e).join(', ')}`)
    }

    function includeTargets (dirName: string): boolean {
      return include.some(value => {
        return value.startsWith(`${dirName}/`) || value.includes(`/${dirName}/`)
      })
    }

    const defaultIgnores = [
      {
        pattern: '**/node_modules/**',
        skipIf: () => includeTargets('node_modules'),
      },
      {
        pattern: '**/.git/**',
        skipIf: () => includeTargets('.git'),
      },
    ]

    const ignoredFiles = [...Session.ignoreDirectoriesMatch]
    for (const ignore of defaultIgnores) {
      if (!ignore.skipIf()) {
        ignoredFiles.push(ignore.pattern)
      }
    }

    const autoIncludes = getAutoIncludes(Session.basePath!, dir, Session.packageManager, include)
    const effectiveIncludes = [...include, ...autoIncludes]

    const includedFiles = await findFilesWithPattern(
      dir,
      effectiveIncludes,
      ignoredFiles,
    )

    for (const filePath of includedFiles) {
      files.push({
        filePath,
        physical: true,
      })
    }

    return {
      browsers: pwConfigParsed.getBrowsers(),
      playwrightVersion,
      relativePlaywrightConfigPath: Session.contextRelativePosixPath(filePath),
      workingDir: Session.relativePosixPath(Session.contextPath!),
      files,
    }
  }
}

export function normalizeVersion (v?: string | undefined): string | undefined {
  const cleaned =
    semver.valid(semver.clean(v ?? '') || '')
    ?? semver.coerce(v ?? '')?.version
  return cleaned && semver.valid(cleaned) ? cleaned : undefined
}

export function getAutoIncludes (
  basePath: string,
  globCwd: string,
  packageManager: PackageManager,
  existingIncludes: string[],
): string[] {
  const autoIncludes: string[] = []

  if (packageManager.name === 'pnpm') {
    const patchesDir = path.join(basePath, 'patches')
    const alreadyIncluded = existingIncludes.some(p => path.resolve(globCwd, p).startsWith(patchesDir))
    if (!alreadyIncluded) {
      const patchesPattern = pathToPosix(path.join(path.relative(globCwd, basePath), 'patches', '*.patch'))
      autoIncludes.push(patchesPattern)
    }
  }

  return autoIncludes
}

export async function getPlaywrightVersionFromPackage (cwd: string): Promise<string> {
  try {
    const require = createRequire(path.join(cwd, 'noop.js'))
    const playwrightPath = require.resolve('@playwright/test/package.json')
    const playwrightPkg = require(playwrightPath)
    const version = normalizeVersion(playwrightPkg.version)

    if (!version) {
      throw new Error('Invalid version found in @playwright/test package.json')
    }

    const packageJson = await detectNearestPackageJson(cwd)
    const range =
      packageJson.dependencies?.['@playwright/test']
      ?? packageJson.devDependencies?.['@playwright/test']

    if (!range) {
      return version
    }

    const validRange = semver.validRange(range)
    if (validRange && !semver.satisfies(version, validRange)) {
      throw new Error(
        `Installed @playwright/test version ${version} does not satisfy the required range "${range}" in package.json. `
        + 'Please run your package manager\'s install command to sync node_modules.',
      )
    }

    return version
  } catch (error) {
    // @ts-ignore
    if (error instanceof Error && error.code === 'MODULE_NOT_FOUND') {
      throw new Error('Could not find @playwright/test package. Make sure it is installed.', { cause: error })
    }
    throw error
  }
}
