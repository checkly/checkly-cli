import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

import semver from 'semver'

import { File } from './check-parser/parser.js'
import {
  detectNearestLockfiles,
  detectNearestPackageJson,
  PackageManager,
} from './check-parser/package-files/package-manager.js'
import { PackageJsonFile } from './check-parser/package-files/package-json-file.js'
import { ImporterCandidate } from './check-parser/package-files/lockfile-package-version.js'
import { lineage } from './check-parser/package-files/walk.js'
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

  async bundle (playwrightConfig: string, include: string[], workingDir?: string): Promise<PlaywrightProjectBundle> {
    const cacheKey = `${playwrightConfig}\0${JSON.stringify(include)}\0${workingDir ?? ''}`
    const cached = this.#cache.get(cacheKey)
    if (cached !== undefined) {
      return await cached
    }
    const promise = this.bundleProject(playwrightConfig, include, workingDir)
    this.#cache.set(cacheKey, promise)
    return await promise
  }

  // The actual bundling, separated from the cache wrapper above so it can be
  // overridden in tests. Not part of the public surface.
  protected async bundleProject (
    playwrightConfig: string,
    include: string[],
    workingDir?: string,
  ): Promise<PlaywrightProjectBundle> {
    const dir = path.resolve(path.dirname(playwrightConfig))
    const filePath = path.resolve(dir, playwrightConfig)

    // Per-entry working directory: where this check's install/test commands run,
    // and where its @playwright/test version is resolved. `workingDir` is authored
    // relative to the project context dir. When omitted it defaults to the context
    // dir, so everything below collapses to the legacy single-working-dir behaviour.
    // Setting it lets one bundled session carry several self-contained fixtures on
    // different Playwright versions without hand-written install/test shell surgery.
    const effectiveWorkingDir = workingDir
      ? path.resolve(Session.contextPath!, workingDir)
      : Session.contextPath!

    // No need of loading everything if there is no lockfile
    const pwtConfig = await Session.loadFile(filePath)

    const pwConfigParsed = new PlaywrightConfig(filePath, pwtConfig)

    // Resolve the version from the working dir when set (that's where the fixture
    // declares/installs its own @playwright/test); otherwise from the config dir.
    const playwrightVersion = await resolvePlaywrightVersion(workingDir ? effectiveWorkingDir : dir)

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
      // Both relative to the effective working dir: the runner runs the test
      // command from `workingDir`, so the config path must resolve from there.
      // With no per-entry workingDir these collapse to the legacy
      // contextPath-relative values.
      relativePlaywrightConfigPath: pathToPosix(path.relative(effectiveWorkingDir, filePath)),
      workingDir: Session.relativePosixPath(effectiveWorkingDir),
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
 * A lockfile is the source of truth: the version it pins is what CI and other
 * developers resolve, and it stays correct even when the local node_modules has
 * drifted (e.g. after switching branches without reinstalling).
 *
 * `cwd` is the entry's effective working directory — the dir that owns the
 * `@playwright/test` install for this entry. When several `playwrightChecks`
 * entries point at different fixtures (each with its own lockfile, possibly on
 * a different Playwright version), each must resolve from *its own* lockfile,
 * not the monorepo/workspace lockfile that physically encloses them all.
 *
 * Resolution order:
 *
 *  1. A *fixture-local* lockfile: the nearest lockfile walking up from `cwd`,
 *     bounded so it stays strictly below the `Session.workspace` (monorepo)
 *     root and never reaches/uses the monorepo lockfile. This is the per-entry
 *     answer.
 *  2. The `Session.workspace` lockfile, scoped to the workspace member that
 *     owns `cwd` (the legacy single-working-dir behaviour; for an entry without
 *     a per-entry workingDir the nearest lockfile above `cwd` simply *is* this
 *     one, so step 1 finds nothing and we land here unchanged).
 *  3. The installed package read from disk.
 *
 * Each step returns `undefined` when it can't derive an answer (no lockfile, an
 * unsupported/unparseable format, or the package isn't pinned for the relevant
 * member), signalling a fall-through to the next.
 */
export async function resolvePlaywrightVersion (cwd: string): Promise<string> {
  const fixtureVersion = await getPlaywrightVersionFromFixtureLockfile(cwd)
  if (fixtureVersion !== undefined) {
    return fixtureVersion
  }

  const lockfileVersion = await getPlaywrightVersionFromWorkspaceLockfile(cwd)
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
 * Resolves the @playwright/test version from the `Session.workspace` lockfile,
 * scoped to the workspace member that owns `cwd`. This is the legacy path used
 * for entries without a per-entry workingDir (where the nearest lockfile above
 * `cwd` simply *is* the workspace lockfile). Returns `undefined` when no answer
 * can be derived, signalling the caller to fall back.
 */
async function getPlaywrightVersionFromWorkspaceLockfile (cwd: string): Promise<string | undefined> {
  const workspaceResult = Session.workspace
  if (!workspaceResult.isOk()) {
    return undefined
  }

  const workspace = workspaceResult.unwrap()
  if (!workspace.lockfile.isOk()) {
    return undefined
  }

  return await getPlaywrightVersionFromLockfile(cwd, {
    lockfilePath: workspace.lockfile.unwrap(),
    packageManager: Session.packageManager,
    rootPath: workspace.root.path,
  })
}

/**
 * Resolves the @playwright/test version from a *fixture-local* lockfile: the
 * nearest lockfile found walking up from `cwd`, but only when it lies strictly
 * below the `Session.workspace` (monorepo) root.
 *
 * This is what makes the CLI the source of truth per `playwrightChecks` entry.
 * An entry's working dir may be a self-contained fixture (its own lockfile in
 * the working dir) or a member of a *fixture-level* workspace whose lockfile
 * sits at a parent directory above the working dir. Either way the nearest
 * lockfile above `cwd` is that fixture's lockfile — until the walk reaches the
 * monorepo root, whose lockfile pins the catalog version and would collapse
 * every fixture to one version (the bug we're fixing).
 *
 * The bound is defined relative to the actual monorepo root, not to any
 * fixture's depth: the discovered lockfile's directory must be a *strict
 * descendant* of the workspace root. If the nearest lockfile is the monorepo's
 * own (found at the workspace root) — which is exactly the case for an entry
 * with no per-entry workingDir — there is no fixture-local answer and we return
 * `undefined` so the caller uses the workspace lockfile path instead.
 *
 * When `Session.workspace` is unavailable we can't establish that bound, so we
 * decline here and let the (likewise-declining) workspace path / installed
 * package fallback handle it — preserving the no-workspace behaviour exactly.
 */
async function getPlaywrightVersionFromFixtureLockfile (cwd: string): Promise<string | undefined> {
  const workspaceResult = Session.workspace
  if (!workspaceResult.isOk()) {
    return undefined
  }

  const workspace = workspaceResult.unwrap()

  // Normalize through realpath so the descendant check and the directory walk
  // line up even when reached through a symlink (e.g. macOS /tmp ->
  // /private/tmp). If either can't be resolved, decline.
  let configDir: string
  let workspaceRoot: string
  try {
    configDir = await fs.realpath(cwd)
    workspaceRoot = await fs.realpath(workspace.root.path)
  } catch {
    return undefined
  }

  // Find the nearest lockfile walking up from the working dir. Unbounded on the
  // way up; we apply the monorepo bound to the *result* below. When several
  // package managers claim a lockfile in the same nearest directory, prefer the
  // workspace's own package manager, else take the first.
  let nearest
  try {
    const lockfiles = await detectNearestLockfiles(configDir)
    nearest = lockfiles.find(({ packageManager }) => packageManager.name === Session.packageManager.name)
      ?? lockfiles[0]
  } catch {
    return undefined
  }

  if (nearest === undefined) {
    return undefined
  }

  // Bound: the lockfile must live strictly below the monorepo root. The nearest
  // lockfile found at (or, defensively, at/above) the workspace root IS the
  // monorepo lockfile — decline so the workspace path handles it. realpath the
  // lockfile's directory so the comparison survives symlinks too.
  let lockfileDir: string
  try {
    lockfileDir = await fs.realpath(path.dirname(nearest.lockfile))
  } catch {
    return undefined
  }

  if (!isStrictDescendant(lockfileDir, workspaceRoot)) {
    return undefined
  }

  return await getPlaywrightVersionFromLockfile(configDir, {
    lockfilePath: nearest.lockfile,
    packageManager: nearest.packageManager,
    rootPath: lockfileDir,
  })
}

/**
 * Whether `child` is a strict descendant of `parent` (not equal, not an
 * ancestor). Both must be absolute, already-normalized (realpath'd) paths.
 */
function isStrictDescendant (child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

interface LockfileResolution {
  lockfilePath: string
  packageManager: PackageManager
  /**
   * The directory the lockfile's importer paths are relative to — the workspace
   * root for the monorepo lockfile, or the fixture (workspace) root for a
   * fixture-local one. The importer walk runs from `cwd` up to here.
   */
  rootPath: string
}

/**
 * Resolves the @playwright/test version from a specific lockfile, scoped to the
 * importer (workspace member) that owns `cwd`. The lockfile, package manager,
 * and root the importer paths are relative to are passed in, so this serves
 * both the monorepo workspace lockfile and a per-entry fixture lockfile.
 * Returns `undefined` when no answer can be derived from the lockfile.
 */
async function getPlaywrightVersionFromLockfile (
  cwd: string,
  { lockfilePath, packageManager, rootPath }: LockfileResolution,
): Promise<string | undefined> {
  // Normalize both paths through realpath so the directory walk and the
  // relative importer paths line up with the workspace root even when the
  // config is reached through a symlink (e.g. macOS /tmp -> /private/tmp).
  let configDir: string
  let workspaceRoot: string
  try {
    configDir = await fs.realpath(cwd)
    workspaceRoot = await fs.realpath(rootPath)
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
