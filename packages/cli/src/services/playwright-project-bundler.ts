import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

import semver from 'semver'

import { File } from './check-parser/parser.js'
import { detectNearestPackageJson, PackageManager } from './check-parser/package-files/package-manager.js'
import { PackageJsonFile } from './check-parser/package-files/package-json-file.js'
import { ImporterCandidate } from './check-parser/package-files/lockfile-package-version.js'
import { lineage } from './check-parser/package-files/walk.js'
import { PlaywrightConfig } from './playwright-config.js'
import { resolveBundleFiles } from './symlink-resolver.js'
import { findFilesWithPattern, pathToPosix } from './util.js'
import { Session } from '../constructs/session.js'

/**
 * The directory archive paths are relative to. Must match the bundler's strip
 * prefix (see Bundler.createForWorkspace), or archive paths won't line up.
 */
function bundleRootPath (): string | undefined {
  const workspace = Session.workspace
  if (!workspace.isOk()) {
    return undefined
  }

  return workspace.unwrap().root.path
}

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

    // Included paths may run through symlinks — under pnpm every package in
    // node_modules is one. Left alone they produce an archive that tar cannot
    // extract, so resolve them into entries that can be.
    const bundleRoot = bundleRootPath()
    if (bundleRoot === undefined) {
      for (const filePath of includedFiles) {
        files.push({
          filePath,
          physical: true,
        })
      }
    } else {
      files.push(...await resolveBundleFiles({
        matchedPaths: includedFiles,
        bundleRoot,
        ignoreCwd: dir,
        ignorePatterns: ignoredFiles,
      }))
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

  // Normalize both paths through realpath so the directory walk and the
  // relative importer paths line up with the workspace root even when the
  // config is reached through a symlink (e.g. macOS /tmp -> /private/tmp).
  let configDir: string
  let workspaceRoot: string
  try {
    configDir = await fs.realpath(cwd)
    workspaceRoot = await fs.realpath(workspace.root.path)
  } catch {
    return undefined
  }

  // Walk from the config directory up to the workspace root, building the chain
  // of candidate importers Node would consult when resolving the package from
  // the config directory. Resolution must mirror that walk: a package required
  // from a member that doesn't declare it resolves to a physically-enclosing
  // member's copy, not necessarily the root's.
  const importers: ImporterCandidate[] = []
  let consumingRange: string | undefined
  let reachedRoot = false
  for (const dir of lineage(configDir, { root: workspaceRoot })) {
    // A directory contributes a declared range only when it actually has a
    // package.json declaring the dep. Intermediate directories still
    // participate (by position) so npm's physical node_modules walk and pnpm's
    // importer lookup see them.
    const packageJson = await PackageJsonFile.loadFromFilePath(PackageJsonFile.filePath(dir))
    const declaredRange = packageJson ? playwrightRange(packageJson) : undefined

    // The consuming package is the nearest package.json at or above the config;
    // its declared range anchors the drift check below.
    if (consumingRange === undefined && declaredRange !== undefined) {
      consumingRange = declaredRange
    }

    importers.push({ relPath: toImporterRelPath(workspaceRoot, dir), declaredRange })

    if (dir === workspaceRoot) {
      reachedRoot = true
      break
    }
  }

  // If the walk never reached the workspace root, the relative paths don't
  // describe importers under this workspace — don't trust them.
  if (!reachedRoot) {
    return undefined
  }

  const raw = await packageManager.resolvePackageVersionFromLockfile(lockfilePath, {
    packageName: PLAYWRIGHT_TEST,
    importers,
  })

  if (raw === undefined) {
    return undefined
  }

  const version = normalizeVersion(raw)
  if (version === undefined) {
    return undefined
  }

  // Drift guard: if the consuming package declares a range the resolved version
  // doesn't satisfy, its package.json was changed without re-resolving the
  // lockfile (or the install is otherwise inconsistent). The cloud runs the
  // resolved version, so warn rather than silently using a mismatched pin.
  if (consumingRange !== undefined) {
    const validRange = semver.validRange(consumingRange)
    if (validRange && !semver.satisfies(version, validRange)) {
      process.stderr.write(
        `Warning: resolved @playwright/test version ${version} does not satisfy the range `
        + `"${consumingRange}" declared in package.json. The lockfile may be out of date; run `
        + `your package manager's install command to update it.\n`,
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
