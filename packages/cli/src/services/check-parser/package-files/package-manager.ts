import fs from 'node:fs/promises'
import path from 'node:path'

import { execa } from 'execa'

import { lineage } from './walk.js'
import { shellQuote } from '../../../services/shell.js'
import { PackageJsonFile } from './package-json-file.js'
import { JsonSourceFile } from './json-source-file.js'
import { OptionalWorkspaceFile, Package, Workspace, WorkspaceOptions } from './workspace.js'
import { loadWorkspacePnpmfiles } from './pnpmfile.js'
import { Err, Ok } from './result.js'
import {
  LockfilePackageQuery,
  parseBunLockfileVersion,
  parseNpmLockfileVersion,
  parsePnpmLockfileVersion,
  parseYarnLockfileVersion,
} from './lockfile-package-version.js'

export class Runnable {
  executable: string
  args: string[]

  constructor (executable: string, args: string[]) {
    this.executable = executable
    this.args = args
  }

  get unsafeDisplayCommand (): string {
    return [this.executable, ...this.args.map(shellQuote)].join(' ')
  }
}

export interface AddCommandOptions {
  packages: string[]
  saveDev?: boolean
}

export interface PackageManager {
  get name (): string
  get representativeLockfiles (): string[]
  get representativeConfigFile (): string | undefined
  installCommand (): Runnable
  addCommand (options: AddCommandOptions): Runnable
  execCommand (args: string[]): Runnable
  /**
   * Command that regenerates the lockfile from the manifests on disk without
   * installing anything (resolution only). Undefined when the package
   * manager has no such mode the CLI supports.
   *
   * The command must read and write the lockfile in the directory it is
   * spawned in. Package managers that support a lockfile-location setting
   * must pin it to the working directory explicitly: the setting can come
   * from config layers the caller cannot inspect (e.g. the user-level
   * ~/.npmrc), and an inherited value would redirect the subprocess's
   * lockfile write outside the working directory — potentially over a
   * real lockfile. When the package manager offers no way to pin the
   * location (bun re-roots at any ancestor package.json whose workspaces
   * glob matches the working directory, with no counteracting flag), the
   * CALLER must verify before spawning that no such ancestor exists — the
   * lockfile pruner refuses to run when its temp dir sits inside a
   * workspace.
   */
  lockfileOnlyInstallCommand (): Runnable | undefined
  lookupWorkspace (dir: string): Promise<Workspace | undefined>
  /**
   * Resolves the version of a single package as recorded in the package
   * manager's lockfile, scoped to a workspace importer. Returns `undefined`
   * when the lockfile can't be read or parsed, the package isn't present, or
   * the format isn't supported — the caller is expected to fall back to
   * another source (e.g. reading the installed package).
   */
  resolvePackageVersionFromLockfile (
    lockfilePath: string,
    query: LockfilePackageQuery,
  ): Promise<string | undefined>
  detector (): PackageManagerDetector
}

class NotDetectedError extends Error {}

/**
 * Reads a lockfile and runs a format-specific parser over it, swallowing IO
 * and parse errors so detection degrades to the caller's fallback rather than
 * throwing on an unreadable or unexpected lockfile.
 */
async function parseLockfileWith (
  lockfilePath: string,
  query: LockfilePackageQuery,
  parse: (content: string, query: LockfilePackageQuery) => string | undefined,
): Promise<string | undefined> {
  let content: string
  try {
    content = await fs.readFile(lockfilePath, 'utf8')
  } catch {
    return undefined
  }

  try {
    return parse(content, query)
  } catch {
    return undefined
  }
}

export type DetectionMethod =
  | 'userAgent'
  | 'runtime'
  | 'lockfile'
  | 'configFile'
  | 'executable'

export abstract class PackageManagerDetector {
  abstract get name (): string

  /**
   * Tie-break precedence when more than one detector matches the same detection
   * method. Higher wins (detectors are sorted descending). Lets a detector rank
   * itself differently per method — e.g. npm deprioritizes its executable
   * because npm is almost always on PATH, so its mere presence is no signal.
   */
  abstract priority (method: DetectionMethod): number

  abstract detectUserAgent (userAgent: string): boolean
  abstract detectRuntime (): boolean
  abstract get representativeLockfiles (): string[]
  abstract get representativeConfigFile (): string | undefined

  async detectLockfile (dir: string): Promise<string> {
    for (const lockfile of this.representativeLockfiles) {
      try {
        return await accessR(path.join(dir, lockfile))
      } catch {
        continue
      }
    }
    throw new NotDetectedError()
  }

  abstract detectConfigFile (dir: string): Promise<string>
  abstract detectExecutable (lookup: PathLookup): Promise<void>
  abstract installCommand (): Runnable
  abstract addCommand (options: AddCommandOptions): Runnable
  abstract execCommand (args: string[]): Runnable
  abstract lookupWorkspace (dir: string): Promise<Workspace | undefined>

  /**
   * Default: no supported lockfile-only resolution mode, so callers skip
   * lockfile pruning. Package managers with such a mode override this.
   *
   * Of the remaining detectors on this default, Yarn Classic simply has no
   * lockfile-only mode (the yarn override covers Berry only — a Classic
   * lockfile is rejected when it is parsed), and cnpm/deno have no verified
   * mode either.
   */
  lockfileOnlyInstallCommand (): Runnable | undefined {
    return undefined
  }

  /**
   * Default: lockfile parsing is unsupported, so callers fall back. Package
   * managers that can parse their lockfile override this.
   */
  // eslint-disable-next-line require-await
  async resolvePackageVersionFromLockfile (
    lockfilePath: string,
    query: LockfilePackageQuery,
  ): Promise<string | undefined> {
    void lockfilePath
    void query
    return undefined
  }

  detector (): PackageManagerDetector {
    return this
  }
}

export class NpmDetector extends PackageManagerDetector implements PackageManager {
  get name (): string {
    return 'npm'
  }

  priority (method: DetectionMethod): number {
    // npm is nearly always installed, so finding the npm binary on PATH is not
    // a meaningful signal — rank it below every other built-in detector for the
    // executable method. Its normal priority applies elsewhere, so it still
    // wins the package-lock.json lockfile tie over cnpm.
    return method === 'executable' ? 0 : 20
  }

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('npm/')
  }

  detectRuntime (): boolean {
    return false
  }

  get representativeLockfiles (): string[] {
    return ['package-lock.json']
  }

  get representativeConfigFile (): undefined {
    return
  }

  // eslint-disable-next-line require-await, @typescript-eslint/no-unused-vars
  async detectConfigFile (dir: string): Promise<string> {
    throw new NotDetectedError()
  }

  async detectExecutable (lookup: PathLookup): Promise<void> {
    await lookup.detectPresence('npm')
  }

  installCommand (): Runnable {
    return new Runnable('npm', ['install'])
  }

  lockfileOnlyInstallCommand (): Runnable {
    // npm has no lockfile-location setting; package-lock.json always lives
    // next to the package.json npm operates on, so there is nothing to pin.
    //
    // --prefer-offline: the pruner's manifests deliberately differ from the
    // lockfile, so npm re-resolves rather than taking its up-to-date fast
    // path, and by default re-fetches every packument it considers stale.
    // With the flag npm accepts cached packuments regardless of age and only
    // contacts the registry for misses. A stale packument can at most change
    // a fresh resolution, and the pruner's subset verification rejects any
    // regenerated entry absent from the original lockfile, so the worst case
    // is a fallback to the original lockfile, never a wrong one.
    return new Runnable('npm', [
      'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline',
    ])
  }

  addCommand (options: AddCommandOptions): Runnable {
    return new Runnable('npm', [
      'install',
      ...options.saveDev ? ['--save-dev'] : [],
      ...options.packages,
    ])
  }

  execCommand (args: string[]): Runnable {
    return new Runnable('npx', args)
  }

  async lookupWorkspace (dir: string): Promise<Workspace | undefined> {
    return await lookupNearestPackageJsonWorkspace(this, dir)
  }

  async resolvePackageVersionFromLockfile (
    lockfilePath: string,
    query: LockfilePackageQuery,
  ): Promise<string | undefined> {
    return await parseLockfileWith(lockfilePath, query, parseNpmLockfileVersion)
  }
}

export class CNpmDetector extends PackageManagerDetector implements PackageManager {
  get name (): string {
    return 'cnpm'
  }

  priority (): number {
    return 10
  }

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('npminstall/')
  }

  detectRuntime (): boolean {
    return false
  }

  get representativeLockfiles (): string[] {
    // cnpm has no lockfile of its own — it uses npm's package-lock.json. We
    // claim it here so a cnpm user agent can be matched against a real
    // lockfile. npm has a higher lockfile priority than cnpm, so a bare
    // package-lock.json with no cnpm user agent still resolves to npm.
    return ['package-lock.json']
  }

  get representativeConfigFile (): undefined {
    return
  }

  // eslint-disable-next-line require-await, @typescript-eslint/no-unused-vars
  async detectConfigFile (dir: string): Promise<string> {
    throw new NotDetectedError()
  }

  async detectExecutable (lookup: PathLookup): Promise<void> {
    await lookup.detectPresence('cnpm')
  }

  installCommand (): Runnable {
    return new Runnable('cnpm', ['install'])
  }

  addCommand (options: AddCommandOptions): Runnable {
    return new Runnable('cnpm', [
      'install',
      ...options.saveDev ? ['--save-dev'] : [],
      ...options.packages,
    ])
  }

  execCommand (args: string[]): Runnable {
    return new Runnable('npx', args)
  }

  async lookupWorkspace (dir: string): Promise<Workspace | undefined> {
    return await lookupNearestPackageJsonWorkspace(this, dir)
  }

  async resolvePackageVersionFromLockfile (
    lockfilePath: string,
    query: LockfilePackageQuery,
  ): Promise<string | undefined> {
    // cnpm shares npm's package-lock.json format.
    return await parseLockfileWith(lockfilePath, query, parseNpmLockfileVersion)
  }
}

export class PNpmDetector extends PackageManagerDetector implements PackageManager {
  get name (): string {
    return 'pnpm'
  }

  priority (): number {
    return 60
  }

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('pnpm/')
  }

  detectRuntime (): boolean {
    return false
  }

  get representativeLockfiles (): string[] {
    return ['pnpm-lock.yaml']
  }

  get representativeConfigFile (): string {
    return 'pnpm-workspace.yaml'
  }

  async detectConfigFile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeConfigFile))
  }

  async detectExecutable (lookup: PathLookup): Promise<void> {
    await lookup.detectPresence('pnpm')
  }

  installCommand (): Runnable {
    return new Runnable('pnpm', ['install'])
  }

  lockfileOnlyInstallCommand (): Runnable {
    // --no-frozen-lockfile is load-bearing: pnpm auto-enables frozen mode
    // when CI=true, and a lockfile-only regeneration is by definition not a
    // frozen install. --lockfile-dir is equally load-bearing: as a CLI flag
    // it outranks a lockfile-dir setting from every config layer (project,
    // user and global npmrc, pnpm-workspace.yaml, env), so no inherited
    // setting can move the lockfile write elsewhere; '.' resolves against
    // the subprocess working directory. Accepted by pnpm 8-11 (pnpm 11
    // dropped the npmrc setting but kept the flag).
    //
    // --config.allowUnusedPatches is what lets a partial-workspace bundle be
    // pruned at all when the project patches a dependency: a bundle carries
    // the full patchedDependencies map but only a subset of the workspace, so
    // a patch whose package belongs to an unbundled member applies to nothing
    // and pnpm 10+ fails the install with ERR_PNPM_UNUSED_PATCH. The flag
    // downgrades that to a warning, so the prune produces a lockfile instead
    // of falling back; the unused declaration itself is filtered out of the
    // bundle afterwards.
    //
    // --config.trustLockfile skips pnpm 11's pre-install supply-chain
    // verification, which re-resolves every lockfile entry against the
    // registry to re-apply minimumReleaseAge/trustPolicy. Left enabled, it
    // fails the lockfile-only install for any entry the registry cannot
    // resolve from this environment (private packages without auth,
    // air-gapped runs) with e.g. ERR_PNPM_FETCH_404. The input lockfile was
    // produced by the user's own install, where those policies were already
    // enforced, and pruning only ever removes entries — the
    // "already-verified lockfile" case the setting is documented for. The
    // --config. form is deliberate: pnpm 10 accepts and ignores unknown
    // --config. settings but rejects a bare --trust-lockfile flag, and the
    // npm_config_trust_lockfile env var does not disable the verification
    // on pnpm 11.
    //
    // --prefer-offline: the pruner's manifests deliberately differ from the
    // lockfile (pruned members, faux manifests, a partial importer set), so
    // pnpm never takes its "lockfile up to date, resolution skipped" fast
    // path. It re-resolves, and for every package it cannot serve from the
    // store it needs registry metadata; without the flag pnpm 10 only serves
    // that from its metadata cache for exact-version specs, while range and
    // catalog specs and optional dependencies are re-fetched on every prune.
    // Behind a slow or intercepting proxy one stalled request plus pnpm's
    // fetch retries exceeds the prune budget on its own. With the flag pnpm
    // uses cached metadata for any spec type and only contacts the registry
    // for misses, so a machine that has installed the project needs little
    // or no network. The soft flag is deliberate: unlike yarn, which
    // regenerates from locked entries and is run with the network blocked,
    // pnpm resolves from metadata, and a cold cache (a machine that never
    // installed the project) is a legitimate first-prune state that --offline
    // would turn into a guaranteed fallback. A stale cached packument can at
    // most change a fresh resolution, and the pruner's subset verification
    // rejects any regenerated entry absent from the original lockfile, so
    // the worst case is a fallback, never a wrong lockfile.
    //
    // The pruner does not compare the lockfile's `settings` section, so any
    // setting pnpm records there ships to the runner unchecked and could
    // mismatch the runner's own install configuration. Verified on pnpm 10
    // and 11: neither --config. setting nor --prefer-offline is recorded in
    // `settings` (only autoInstallPeers and excludeLinksFromLockfile are).
    return new Runnable('pnpm', [
      'install', '--lockfile-only', '--ignore-scripts', '--no-frozen-lockfile', '--lockfile-dir', '.',
      '--config.allowUnusedPatches=true',
      '--config.trustLockfile=true',
      '--prefer-offline',
    ])
  }

  addCommand (options: AddCommandOptions): Runnable {
    return new Runnable('pnpm', [
      'add',
      ...options.saveDev ? ['--save-dev'] : [],
      ...options.packages,
    ])
  }

  execCommand (args: string[]): Runnable {
    return new Runnable('pnpm', args)
  }

  async lookupWorkspace (dir: string): Promise<Workspace | undefined> {
    // To avoid having to bring in a yaml parser, just call pnpm directly.
    // However, to avoid calling pnpm if it's likely not installed, detect
    // the presence of the workspace file first.
    for (const searchPath of lineage(dir)) {
      try {
        await this.detectConfigFile(searchPath)
      } catch {
        continue
      }

      const pnpmArgs = [
        'list',
        '--json',
        '--recursive',
        '--depth',
        '1',
      ]

      const result = await execa('pnpm', pnpmArgs, {
        cwd: searchPath,
      })

      type PnpmProjectOutput = {
        name: string
        path: string
        version?: string
      }

      const output: PnpmProjectOutput[] = JSON.parse(result.stdout)
      if (!Array.isArray(output)) {
        throw new Error(`The output of 'pnpm list' was not an array (stdout=${result.stdout}, stderr=${result.stderr})`)
      }

      const [root, dependencies] = output.reduce(
        ([root, dependencies]: [PnpmProjectOutput | undefined, PnpmProjectOutput[]], project) => {
          if (root === undefined) {
            return [project, dependencies]
          }

          // The project with the shortest path should be the workspace root.
          if (root.path.length > project.path.length) {
            return [project, [...dependencies, root]]
          }

          return [root, [...dependencies, project]]
        },
        [undefined, []],
      )

      if (root === undefined) {
        return
      }

      const rootPackage = new Package({
        name: root.name,
        path: root.path,
        version: root.version,
        workspaces: dependencies.map(dep => dep.path),
      })

      const packages = dependencies.map(({ name, path, version }) => {
        return new Package({
          name,
          path,
          version,
        })
      })

      return await initWorkspace(this, {
        root: rootPackage,
        packages,
      })
    }
  }

  async resolvePackageVersionFromLockfile (
    lockfilePath: string,
    query: LockfilePackageQuery,
  ): Promise<string | undefined> {
    return await parseLockfileWith(lockfilePath, query, parsePnpmLockfileVersion)
  }
}

export class YarnDetector extends PackageManagerDetector implements PackageManager {
  get name (): string {
    return 'yarn'
  }

  priority (): number {
    return 30
  }

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('yarn/')
  }

  detectRuntime (): boolean {
    return false
  }

  get representativeLockfiles (): string[] {
    return ['yarn.lock']
  }

  get representativeConfigFile (): undefined {
    return
  }

  // eslint-disable-next-line require-await, @typescript-eslint/no-unused-vars
  async detectConfigFile (dir: string): Promise<string> {
    throw new NotDetectedError()
  }

  async detectExecutable (lookup: PathLookup): Promise<void> {
    await lookup.detectPresence('yarn')
  }

  installCommand (): Runnable {
    return new Runnable('yarn', ['install'])
  }

  lockfileOnlyInstallCommand (): Runnable {
    // Yarn Berry only — a Yarn Classic lockfile is rejected when it is
    // parsed, and a Classic BINARY must never run this command: verified
    // on 1.22.22 that Classic silently ignores --mode=update-lockfile and
    // performs a full install, scripts included, so the pruner refuses
    // with a version probe before spawning it. Verified on yarn 4.18.0 and
    // 3.8.7: this regenerates yarn.lock fully offline, even with a cold
    // cache — the resolution step reuses locked entries and prunes the
    // unreachable ones, the fetch step only touches entries that are new
    // (a prune introduces none), and the link step is skipped entirely, so
    // no install scripts can run. CI detection and enableImmutableInstalls
    // do not apply to this mode. With a lockfile present in the working
    // directory Berry roots there — it does not re-root at ancestor
    // workspace globs the way bun does. Yarn 3's lockfileFilename setting
    // could redirect the write, but it would have to live in the unbundled
    // .yarnrc.yml; the pruner's regenerated-lockfile-missing skip and its
    // child-env network guard bound that case. The remaining config
    // hazard, hardened mode revalidating locked entries against the
    // registry, is disabled via the child environment as well.
    return new Runnable('yarn', ['install', '--mode=update-lockfile'])
  }

  addCommand (options: AddCommandOptions): Runnable {
    return new Runnable('yarn', [
      'add',
      ...options.saveDev ? ['--dev'] : [],
      ...options.packages,
    ])
  }

  execCommand (args: string[]): Runnable {
    return new Runnable('yarn', args)
  }

  async lookupWorkspace (dir: string): Promise<Workspace | undefined> {
    return await lookupNearestPackageJsonWorkspace(this, dir)
  }

  async resolvePackageVersionFromLockfile (
    lockfilePath: string,
    query: LockfilePackageQuery,
  ): Promise<string | undefined> {
    return await parseLockfileWith(lockfilePath, query, parseYarnLockfileVersion)
  }
}

export class DenoDetector extends PackageManagerDetector implements PackageManager {
  get name (): string {
    return 'deno'
  }

  priority (): number {
    return 40
  }

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('deno/')
  }

  detectRuntime (): boolean {
    return process.versions.deno !== undefined
  }

  get representativeLockfiles (): string[] {
    return ['deno.lock']
  }

  get representativeConfigFile (): string {
    return 'deno.json'
  }

  async detectConfigFile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeConfigFile))
  }

  async detectExecutable (lookup: PathLookup): Promise<void> {
    await lookup.detectPresence('deno')
  }

  installCommand (): Runnable {
    return new Runnable('deno', ['install'])
  }

  addCommand (options: AddCommandOptions): Runnable {
    return new Runnable('deno', [
      'add',
      ...options.saveDev ? ['--dev'] : [],
      ...options.packages,
    ])
  }

  execCommand (args: string[]): Runnable {
    return new Runnable('deno', ['run', '-A', `npm:${args[0]}`, ...args.slice(1)])
  }

  async lookupWorkspace (dir: string): Promise<Workspace | undefined> {
    for (const searchPath of lineage(dir)) {
      try {
        const configFile = await this.detectConfigFile(searchPath)

        type Schema = {
          workspace?: string[]
        }

        const jsonFile = await JsonSourceFile.loadFromFilePath<Schema>(configFile)
        if (!jsonFile) {
          continue
        }

        const rootPackage = await Package.loadFromDirPath(searchPath)
        if (rootPackage === undefined) {
          continue
        }

        const workspaces = jsonFile.data.workspace?.map(packagePath => {
          return path.resolve(searchPath, packagePath)
        })

        if (!workspaces) {
          continue
        }

        const packages: Package[] = []

        for (const workspace of workspaces) {
          const workspacePackage = await Package.loadFromDirPath(workspace)
          if (workspacePackage === undefined) {
            continue
          }

          packages.push(workspacePackage)
        }

        return await initWorkspace(this, {
          root: rootPackage,
          packages,
        })
      } catch {
        continue
      }
    }
  }
}

export class BunDetector extends PackageManagerDetector implements PackageManager {
  get name (): string {
    return 'bun'
  }

  priority (): number {
    return 50
  }

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('bun/')
  }

  detectRuntime (): boolean {
    return process.versions.bun !== undefined
  }

  get representativeLockfiles (): string[] {
    return ['bun.lock', 'bun.lockb']
  }

  get representativeConfigFile (): undefined {
    return
  }

  // eslint-disable-next-line require-await, @typescript-eslint/no-unused-vars
  async detectConfigFile (dir: string): Promise<string> {
    throw new NotDetectedError()
  }

  async detectExecutable (lookup: PathLookup): Promise<void> {
    await lookup.detectPresence('bun')
  }

  installCommand (): Runnable {
    return new Runnable('bun', ['install'])
  }

  addCommand (options: AddCommandOptions): Runnable {
    return new Runnable('bun', [
      'add',
      ...options.saveDev ? ['--dev'] : [],
      ...options.packages,
    ])
  }

  execCommand (args: string[]): Runnable {
    return new Runnable('bunx', args)
  }

  async lookupWorkspace (dir: string): Promise<Workspace | undefined> {
    return await lookupNearestPackageJsonWorkspace(this, dir)
  }

  lockfileOnlyInstallCommand (): Runnable {
    // Verified on bun 1.3.11: this regenerates bun.lock offline from the
    // recorded resolutions, pruning entries no longer reachable from the
    // manifests on disk, without touching node_modules. One exception: when
    // a workspace member's name collides with a registry dependency
    // consumed elsewhere, bun rejects its own lockfile (InvalidPackageKey)
    // and silently re-resolves from the network with exit 0 — the pruner's
    // tuple-subset and importer-preservation checks bound that fail-closed.
    // Bun has no lockfile-location setting to pin (unlike pnpm's
    // --lockfile-dir) — but it re-roots at any ancestor package.json whose
    // workspaces glob matches the working directory and then reads AND
    // writes the lockfile at that root, with no flag to prevent it. Callers
    // must guard against that themselves; the lockfile pruner refuses to
    // run when its temp dir sits inside a workspace. CI=true does not imply
    // a frozen lockfile (unlike pnpm), so no unfreeze flag is needed. The
    // one freeze vector — bunfig `[install] frozenLockfile = true` — has no
    // CLI override at all and simply fails the command, which the pruner
    // reports and falls back on. Only the text lockfile (bun.lock) can be
    // verified after regeneration; the binary bun.lockb is rejected later,
    // when the lockfile is parsed.
    return new Runnable('bun', ['install', '--lockfile-only', '--ignore-scripts'])
  }

  async resolvePackageVersionFromLockfile (
    lockfilePath: string,
    query: LockfilePackageQuery,
  ): Promise<string | undefined> {
    // The legacy binary lockfile (bun.lockb) isn't parseable here; only the
    // text format (bun.lock) is. Skip the binary form so the caller falls back.
    if (lockfilePath.endsWith('.lockb')) {
      return undefined
    }
    return await parseLockfileWith(lockfilePath, query, parseBunLockfileVersion)
  }
}

async function accessR (filePath: string): Promise<string> {
  try {
    await fs.access(filePath, fs.constants.R_OK)
    return filePath
  } catch {
    throw new NotDetectedError()
  }
}

async function accessX (filePath: string): Promise<string> {
  try {
    await fs.access(filePath, fs.constants.X_OK)
    return filePath
  } catch {
    throw new NotDetectedError()
  }
}

function* chunks<T> (array: T[], size: number): Generator<T[], void> {
  for (let i = 0, l = array.length; i < l; i += size) {
    yield array.slice(i, i + size)
  }
}

/**
 * Inspiration taken from https://github.com/otiai10/lookpath.
 */
export class PathLookup {
  static win = process.platform.startsWith('win')

  // The default extension list execa's Windows resolution falls back to when
  // PATHEXT is unset — without it, a lookup on such a system would only probe
  // the extensionless name and miss every .CMD/.EXE shim. This lookup feeds
  // both package-manager detection and the pruner's missing-executable
  // classification, so it deliberately mirrors what execa actually spawns:
  // quoted-Path-entry stripping, empty-Path-entry skipping, this default
  // list, and the unset/empty PATHEXT handling below. Knowingly not
  // mirrored: which-command's cwd-before-PATH search order and its
  // no-bare-name rule under an empty PATHEXT.
  static defaultWinPathext = ['.COM', '.EXE', '.BAT', '.CMD', '.VBS', '.VBE', '.JS', '.JSE', '.WSF', '.WSH', '.MSC']

  paths: string[]
  pathext: string[]
  pathextSet = new Set<string>()

  constructor () {
    if (PathLookup.win) {
      // Windows allows individually quoted Path entries
      // (`C:\Windows;"C:\Program Files\nodejs"`); the spawn's own resolver
      // strips the quotes, so this lookup must too or the two disagree.
      // Empty entries are skipped like execa/which-command skip them
      // (searching the current directory implicitly is a security risk).
      this.paths = (process.env['Path']?.split(path.delimiter) ?? [])
        .map(entry => entry.replace(/^"(.*)"$/, '$1'))
        .filter(entry => entry !== '')
      // execa reads PATHEXT itself and passes the raw value through to
      // which-command, so an empty (but set) PATHEXT disables extension
      // probing while only an unset one falls back to the default list.
      // (Standalone which-command would default on empty too — the composite
      // execa behavior is what spawns actually see.)
      this.pathext = process.env['PATHEXT'] !== undefined
        ? process.env['PATHEXT'].split(path.delimiter).filter(ext => ext !== '')
        : [...PathLookup.defaultWinPathext]
      this.pathext.forEach(ext => this.pathextSet.add(ext.toUpperCase()))
    } else {
      this.paths = process.env['PATH']?.split(path.delimiter) ?? []
      this.pathext = []
    }
  }

  async detectPresence (executable: string): Promise<void> {
    const foundPath = await this.lookupPath(executable)
    if (foundPath === undefined) {
      throw new NotDetectedError()
    }
  }

  async lookupPath (executable: string): Promise<string | undefined> {
    const ext = path.extname(executable).toUpperCase()

    const paths = this.paths.flatMap(prefix => {
      if (this.pathextSet.has(ext)) {
        return [path.join(prefix, executable)]
      }

      return [
        path.join(prefix, executable),
        ...this.pathext.map(ext => path.join(prefix, executable + ext)),
      ]
    })

    // There may be a large number of paths. With Promise.all(), we'd have to
    // wait until every single possible path has been checked even if we found
    // a match immediately. Use reasonably sized chunks instead.
    //
    // On Windows (where PATHEXT exists), make sure that the chunk size is
    // at least large enough to cover all the possible extensions of a path.
    for (const chunk of chunks(paths, Math.max(this.pathext.length + 1, 8))) {
      const results = await Promise.all(chunk.map(async path => {
        try {
          await accessX(path)
          return path
        } catch {
          return
        }
      }))

      for (const result of results) {
        if (result !== undefined) {
          return result
        }
      }
    }
  }
}

export const npmPackageManager = new NpmDetector()

// Detection precedence is governed by each detector's priority(method), not by
// this array's order, so listing is free to stay readable. (The order is still
// used verbatim for the `checkly import` package-manager prompt menu.)
export const knownPackageManagers: PackageManagerDetector[] = [
  new PNpmDetector(),
  new BunDetector(),
  new DenoDetector(),
  new YarnDetector(),
  npmPackageManager,
  new CNpmDetector(),
]

interface DetectPackageManagerImplOptions {
  detectors: PackageManagerDetector[]
  root?: string
  requireLockfile: boolean
}

async function detectPackageManagerImpl (
  dir: string,
  options: DetectPackageManagerImplOptions,
): Promise<PackageManager | undefined> {
  const {
    detectors,
    requireLockfile,
  } = options

  // Detectors are evaluated highest-priority-first within each detection
  // method, so the order they were supplied in never affects the result.
  const ordered = (method: DetectionMethod): PackageManagerDetector[] =>
    [...detectors].sort((a, b) => b.priority(method) - a.priority(method))

  const lockfileDetected = new Set(Array.from(
    await detectNearestLockfiles(dir, {
      detectors,
      root: options?.root,
    }).catch(() => []),
    ({ packageManager }) => packageManager,
  ))

  // Try user agent first.
  const userAgent = process.env['npm_config_user_agent']
  if (userAgent !== undefined) {
    for (const detector of ordered('userAgent')) {
      if (detector.detectUserAgent(userAgent)) {
        if ((!requireLockfile || lockfileDetected.has(detector))) {
          return detector
        }
      }
    }
  }

  // Next, try runtime.
  for (const detector of ordered('runtime')) {
    if (detector.detectRuntime()) {
      if ((!requireLockfile || lockfileDetected.has(detector))) {
        return detector
      }
    }
  }

  // Next, try to find a lockfile. When several package managers claim a lockfile
  // in the nearest directory (e.g. npm and cnpm both claim package-lock.json),
  // the highest-priority one wins.
  const lockfileWinner = ordered('lockfile').find(detector => lockfileDetected.has(detector))
  if (lockfileWinner !== undefined) {
    return lockfileWinner
  }

  // If we get here, there's no lockfile, in which case we have to stop
  // if it's required.
  if (requireLockfile) {
    return undefined
  }

  // Next, try to find a config file. As with lockfiles, when several package
  // managers have a config file in the nearest directory, the highest-priority
  // one wins.
  const configDetected = new Set(Array.from(
    await detectNearestConfigFiles(dir, {
      detectors,
      root: options?.root,
    }).catch(() => []),
    ({ packageManager }) => packageManager,
  ))

  const configWinner = ordered('configFile').find(detector => configDetected.has(detector))
  if (configWinner !== undefined) {
    return configWinner
  }

  // Finally, try to find a relevant executable.
  //
  // This can generate a whole bunch of path lookups. Try one by one despite
  // async support.
  const lookup = new PathLookup()
  for (const detector of ordered('executable')) {
    try {
      await detector.detectExecutable(lookup)
      return detector
    } catch {
      continue
    }
  }

  return undefined
}

export interface DetectPackageManagerOptions {
  detectors: PackageManagerDetector[]
  root?: string
}

export async function detectPackageManager (
  dir: string,
  options?: DetectPackageManagerOptions,
): Promise<PackageManager> {
  const detectors = options?.detectors ?? knownPackageManagers

  // Try with lockfile required first, which gives a stronger signal.
  // Fall back to not requiring it.
  for (const requireLockfile of [true, false]) {
    const pm = await detectPackageManagerImpl(dir, {
      detectors,
      requireLockfile,
      root: options?.root,
    })
    if (pm !== undefined) {
      return pm
    }
  }

  // If all else fails, just assume npm.
  return npmPackageManager
}

export interface NearestLockFile {
  packageManager: PackageManager
  lockfile: string
}

export class NoLockfileFoundError extends Error {
  searchPaths: string[]
  lockfiles: string[]

  constructor (searchPaths: string[], lockfiles: string[], options?: ErrorOptions) {
    const message = `Unable to detect a lockfile in any of the following paths:`
      + `\n\n`
      + `${searchPaths.map(searchPath => `  ${searchPath}`).join('\n')}`
      + `\n\n`
      + `Lockfiles we looked for:`
      + `\n\n`
      + `${lockfiles.map(lockfile => `  ${lockfile}`).join('\n')}`
    super(message, options)
    this.name = 'NoLockfileFoundError'
    this.searchPaths = searchPaths
    this.lockfiles = lockfiles
  }
}

export interface DetectNearestLockfileOptions {
  detectors?: PackageManagerDetector[]
  root?: string
}

/**
 * Searches `dir` and every parent directory (up to and including
 * `options.root`) for a lockfile of any of the given `options.detectors`
 * (or all known package manager detectors if not given). The search stops
 * when a directory containing lockfiles is found.
 *
 * @returns All detected lockfiles in the directory.
 * @throws {NoLockfileFoundError} If no directory containing a lockfile is found.
 */
export async function detectNearestLockfiles (
  dir: string,
  options?: DetectNearestLockfileOptions,
): Promise<NearestLockFile[]> {
  const detectors = options?.detectors ?? knownPackageManagers

  const searchPaths: string[] = []

  for (const searchPath of lineage(dir, { root: options?.root })) {
    searchPaths.push(searchPath)

    const results = await Promise.all(detectors.map(async detector => {
      try {
        const lockfile = await detector.detectLockfile(searchPath)
        return {
          packageManager: detector,
          lockfile,
        }
      } catch {
        return null
      }
    }))

    const found = results.filter(value => value !== null)
    if (found.length > 0) {
      return found
    }
  }

  const lockfiles = [...new Set(detectors.flatMap(detector => detector.representativeLockfiles))]

  throw new NoLockfileFoundError(searchPaths, lockfiles)
}

export interface NearestConfigFile {
  packageManager: PackageManager
  configFile: string
}

export class NoConfigFileFoundError extends Error {
  searchPaths: string[]
  configFiles: string[]

  constructor (searchPaths: string[], configFiles: string[], options?: ErrorOptions) {
    const message = `Unable to detect a config file in any of the following paths:`
      + `\n\n`
      + `${searchPaths.map(searchPath => `  ${searchPath}`).join('\n')}`
      + `\n\n`
      + `Config files we looked for:`
      + `\n\n`
      + `${configFiles.map(lockfile => `  ${lockfile}`).join('\n')}`
    super(message, options)
    this.name = 'NoConfigFileFoundError'
    this.searchPaths = searchPaths
    this.configFiles = configFiles
  }
}

export interface DetectNearestConfigFileOptions {
  detectors?: PackageManagerDetector[]
  root?: string
}

/**
 * Searches `dir` and every parent directory (up to and including
 * `options.root`) for a config file of any of the given `options.detectors`
 * (or all known package manager detectors if not given). The search stops
 * when a directory containing config files is found.
 *
 * @returns All detected config files in the directory.
 * @throws {NoConfigFileFoundError} If no directory containing a config file is found.
 */
export async function detectNearestConfigFiles (
  dir: string,
  options?: DetectNearestConfigFileOptions,
): Promise<NearestConfigFile[]> {
  const detectors = options?.detectors ?? knownPackageManagers

  const searchPaths: string[] = []

  for (const searchPath of lineage(dir, { root: options?.root })) {
    searchPaths.push(searchPath)

    const results = await Promise.all(detectors.map(async detector => {
      try {
        const configFile = await detector.detectConfigFile(searchPath)
        return {
          packageManager: detector,
          configFile,
        }
      } catch {
        return null
      }
    }))

    const found = results.filter(value => value !== null)
    if (found.length > 0) {
      return found
    }
  }

  const configFiles = [...new Set(detectors.flatMap(detector => detector.representativeConfigFile ?? []))]

  throw new NoConfigFileFoundError(searchPaths, configFiles)
}

export class NoPackageJsonFoundError extends Error {
  searchPaths: string[]

  constructor (searchPaths: string[], options?: ErrorOptions) {
    const message = `Unable to detect a package.json in any of the following paths:`
      + `\n\n`
      + `${searchPaths.map(searchPath => `  ${searchPath}`).join('\n')}`
    super(message, options)
    this.name = 'NoPackageJsonFoundError'
    this.searchPaths = searchPaths
  }
}

export interface DetectNearestPackageJsonOptions {
  root?: string
}

export async function detectNearestPackageJson (
  dir: string,
  options?: DetectNearestPackageJsonOptions,
): Promise<PackageJsonFile> {
  const searchPaths: string[] = []

  for (const searchPath of lineage(dir, { root: options?.root })) {
    searchPaths.push(searchPath)

    const packageJson = await PackageJsonFile.loadFromFilePath(
      PackageJsonFile.filePath(searchPath),
    )

    if (packageJson) {
      return packageJson
    }
  }

  throw new NoPackageJsonFoundError(searchPaths)
}

export async function fauxWorkspaceFromPackageJson (
  packageManager: PackageManager,
  packageJsonFile: PackageJsonFile,
): Promise<Workspace> {
  const rootPackage = new Package({
    name: packageJsonFile.name!,
    path: packageJsonFile.basePath,
    version: packageJsonFile.version,
  })

  return await initWorkspace(packageManager.detector(), {
    root: rootPackage,
    packages: [],
  })
}

async function lookupNearestPackageJsonWorkspace (
  detector: PackageManagerDetector,
  dir: string,
): Promise<Workspace | undefined> {
  for (const searchPath of lineage(dir)) {
    const rootPackage = await Package.loadFromDirPath(searchPath)
    if (!rootPackage) {
      continue
    }

    if (rootPackage.workspaces === undefined || rootPackage.workspaces.length === 0) {
      continue
    }

    const packages = await Workspace.resolvePatterns(searchPath, rootPackage.workspaces)

    return await initWorkspace(detector, {
      root: rootPackage,
      packages,
    })
  }
}

async function initWorkspace (
  detector: PackageManagerDetector,
  options: Pick<WorkspaceOptions, 'root' | 'packages'>,
) {
  const lockfile: OptionalWorkspaceFile = await detectNearestLockfiles(options.root.path, {
    root: options.root.path,
    detectors: [detector],
  }).then(
    ([{ lockfile }]) => Ok(lockfile),
    reason => Err(reason),
  )

  const configFile: OptionalWorkspaceFile = await detectNearestConfigFiles(options.root.path, {
    root: options.root.path,
    detectors: [detector],
  }).then(
    ([{ configFile }]) => Ok(configFile),
    reason => Err(reason),
  )

  // Pnpmfiles are only meaningful for pnpm workspaces. Discovering them here
  // gives the bundler and the cache hash a single source of truth for which
  // pnpmfiles exist and whether they can be bundled.
  const pnpmfiles = detector.name === 'pnpm'
    ? await loadWorkspacePnpmfiles(options.root.path, configFile.ok(), lockfile.ok())
    : []

  return new Workspace({
    ...options,
    lockfile,
    configFile,
    pnpmfiles,
  })
}
