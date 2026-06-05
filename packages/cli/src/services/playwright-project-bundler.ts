import { createRequire } from 'node:module'
import path from 'node:path'

import semver from 'semver'

import { File } from './check-parser/parser.js'
import { detectNearestPackageJson, PackageManager } from './check-parser/package-files/package-manager.js'
import { PackageJsonFile } from './check-parser/package-files/package-json-file.js'
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

    const playwrightVersion = await resolvePlaywrightVersion(dir)

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

const PLAYWRIGHT_TEST = '@playwright/test'

/**
 * Resolves the @playwright/test version that should run in the cloud.
 *
 * The project's lockfile is the source of truth: the version it pins is what
 * CI and other developers resolve, and it stays correct even when the local
 * node_modules has drifted (e.g. after switching branches without
 * reinstalling). When no usable lockfile answer is available — no lockfile, an
 * unsupported/unparseable format, or the package isn't pinned for the relevant
 * workspace member — we fall back to reading the installed package.
 */
export async function resolvePlaywrightVersion (cwd: string): Promise<string> {
  const lockfileVersion = await getPlaywrightVersionFromLockfile(cwd)
  if (lockfileVersion !== undefined) {
    return lockfileVersion
  }

  return await getPlaywrightVersionFromPackage(cwd)
}

function playwrightRange (packageJson: PackageJsonFile): string | undefined {
  return packageJson.dependencies?.[PLAYWRIGHT_TEST]
    ?? packageJson.devDependencies?.[PLAYWRIGHT_TEST]
}

/**
 * Resolves the @playwright/test version from the workspace lockfile, scoped to
 * the workspace member that owns the Playwright config. Returns `undefined`
 * when no answer can be derived from the lockfile, signalling the caller to
 * fall back.
 */
async function getPlaywrightVersionFromLockfile (cwd: string): Promise<string | undefined> {
  const workspaceResult = Session.workspace
  if (!workspaceResult.isOk()) {
    return undefined
  }

  const workspace = workspaceResult.unwrap()
  if (!workspace.lockfile.isOk()) {
    return undefined
  }

  const lockfilePath = workspace.lockfile.unwrap()
  const packageManager = Session.packageManager

  // The Playwright config belongs to the nearest package.json at or above its
  // directory — that's the workspace importer whose pinned version applies.
  let consumingPackageJson: PackageJsonFile
  try {
    consumingPackageJson = await detectNearestPackageJson(cwd, { root: workspace.root.path })
  } catch {
    return undefined
  }

  const importerRelPath = toImporterRelPath(workspace.root.path, consumingPackageJson.basePath)
  const declaredRange = playwrightRange(consumingPackageJson)

  // The root package.json range disambiguates yarn resolutions and covers the
  // case where the member relies on a dependency hoisted from the root.
  let rootRange: string | undefined
  if (importerRelPath !== '.') {
    try {
      const rootPackageJson = await detectNearestPackageJson(workspace.root.path, {
        root: workspace.root.path,
      })
      rootRange = playwrightRange(rootPackageJson)
    } catch {
      // No root package.json — leave rootRange undefined.
    }
  }

  let raw = await packageManager.parsePackageVersionFromLockfile(lockfilePath, {
    packageName: PLAYWRIGHT_TEST,
    importerRelPath,
    declaredRange: declaredRange ?? rootRange,
  })

  // If the member doesn't pin it directly, fall back to the root importer.
  if (raw === undefined && importerRelPath !== '.') {
    raw = await packageManager.parsePackageVersionFromLockfile(lockfilePath, {
      packageName: PLAYWRIGHT_TEST,
      importerRelPath: '.',
      declaredRange: rootRange,
    })
  }

  if (raw === undefined) {
    return undefined
  }

  const version = normalizeVersion(raw)
  if (version === undefined) {
    return undefined
  }

  // Drift guard: a declared range the lockfile version doesn't satisfy means
  // package.json was changed without re-resolving the lockfile. The cloud runs
  // the lockfile version, so warn rather than silently using a stale pin.
  const range = declaredRange ?? rootRange
  if (range !== undefined) {
    const validRange = semver.validRange(range)
    if (validRange && !semver.satisfies(version, validRange)) {
      process.stderr.write(
        `Warning: lockfile @playwright/test version ${version} does not satisfy the range `
        + `"${range}" declared in package.json. The lockfile may be out of date; run your `
        + `package manager's install command to update it.\n`,
      )
    }
  }

  return version
}

function toImporterRelPath (rootPath: string, packagePath: string): string {
  const rel = path.relative(rootPath, packagePath)
  if (rel === '' || rel === '.') {
    return '.'
  }
  return pathToPosix(rel)
}

export async function getPlaywrightVersionFromPackage (cwd: string): Promise<string> {
  try {
    const require = createRequire(path.join(cwd, 'noop.js'))
    const playwrightPath = require.resolve(`${PLAYWRIGHT_TEST}/package.json`)
    const playwrightPkg = require(playwrightPath)
    const version = normalizeVersion(playwrightPkg.version)

    if (!version) {
      throw new Error('Invalid version found in @playwright/test package.json')
    }

    const packageJson = await detectNearestPackageJson(cwd)
    const range = playwrightRange(packageJson)

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
