import fs from 'node:fs/promises'
import path from 'node:path'

import { execa } from 'execa'

import { lineage } from './walk.js'
import { shellQuote } from '../../../services/shell.js'
import { PackageJsonFile } from './package-json-file.js'
import { JsonSourceFile } from './json-source-file.js'
import { OptionalWorkspaceFile, Package, Workspace, WorkspaceOptions } from './workspace.js'
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
        workspaces: dependencies.map(dep => dep.path),
      })

      const packages = dependencies.map(({ name, path }) => {
        return new Package({
          name,
          path,
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

  paths: string[]
  pathext: string[]
  pathextSet = new Set<string>()

  constructor () {
    if (PathLookup.win) {
      this.paths = process.env['Path']?.split(path.delimiter) ?? []
      this.pathext = process.env['PATHEXT']?.split(path.delimiter) ?? []
      this.pathext.forEach(ext => this.pathextSet.add(ext.toUpperCase()))
    } else {
      this.paths = process.env['PATH']?.split(path.delimiter) ?? []
      this.pathext = []
    }
  }

  // eslint-disable-next-line require-await
  async detectPresence (executable: string): Promise<void> {
    const foundPath = this.lookupPath(executable)
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

  return new Workspace({
    ...options,
    lockfile,
    configFile,
  })
}
