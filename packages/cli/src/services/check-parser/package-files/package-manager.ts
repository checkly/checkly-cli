import fs from 'node:fs/promises'
import path from 'node:path'

import { lineage } from './walk'
import { shellQuote } from '../../../services/shell'
import { PackageJsonFile } from './package-json-file'
import { JsonSourceFile } from './json-source-file'
import { OptionalWorkspaceFile, Package, Workspace, WorkspaceOptions } from './workspace'
import { Err, Ok } from './result'

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

export interface PackageManager {
  get name (): string
  get representativeLockfile (): string | undefined
  get representativeConfigFile (): string | undefined
  installCommand (): Runnable
  execCommand (args: string[]): Runnable
  lookupWorkspace (dir: string): Promise<Workspace | undefined>
  detector (): PackageManagerDetector
}

class NotDetectedError extends Error {}

export abstract class PackageManagerDetector {
  abstract get name (): string
  abstract detectUserAgent (userAgent: string): boolean
  abstract detectRuntime (): boolean
  abstract get representativeLockfile (): string | undefined
  abstract get representativeConfigFile (): string | undefined
  abstract detectLockfile (dir: string): Promise<string>
  abstract detectConfigFile (dir: string): Promise<string>
  abstract detectExecutable (lookup: PathLookup): Promise<void>
  abstract installCommand (): Runnable
  abstract execCommand (args: string[]): Runnable
  abstract lookupWorkspace (dir: string): Promise<Workspace | undefined>
  detector (): PackageManagerDetector {
    return this
  }
}

export class NpmDetector extends PackageManagerDetector implements PackageManager {
  get name (): string {
    return 'npm'
  }

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('npm/')
  }

  detectRuntime (): boolean {
    return false
  }

  get representativeLockfile (): string {
    return 'package-lock.json'
  }

  get representativeConfigFile (): undefined {
    return
  }

  async detectLockfile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeLockfile))
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

  execCommand (args: string[]): Runnable {
    return new Runnable('npx', args)
  }

  async lookupWorkspace (dir: string): Promise<Workspace | undefined> {
    return await lookupNearestPackageJsonWorkspace(this, dir)
  }
}

export class CNpmDetector extends PackageManagerDetector implements PackageManager {
  get name (): string {
    return 'cnpm'
  }

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('npminstall/')
  }

  detectRuntime (): boolean {
    return false
  }

  get representativeLockfile (): undefined {
    return
  }

  get representativeConfigFile (): undefined {
    return
  }

  // eslint-disable-next-line require-await
  async detectLockfile (): Promise<string> {
    throw new NotDetectedError()
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

  execCommand (args: string[]): Runnable {
    return new Runnable('npx', args)
  }

  async lookupWorkspace (dir: string): Promise<Workspace | undefined> {
    return await lookupNearestPackageJsonWorkspace(this, dir)
  }
}

export class PNpmDetector extends PackageManagerDetector implements PackageManager {
  get name (): string {
    return 'pnpm'
  }

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('pnpm/')
  }

  detectRuntime (): boolean {
    return false
  }

  get representativeLockfile (): string {
    return 'pnpm-lock.yaml'
  }

  get representativeConfigFile (): string {
    return 'pnpm-workspace.yaml'
  }

  async detectLockfile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeLockfile))
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

      const { execa } = await import('execa')

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
        workspaces: Object.values(dependencies).map(dep => dep.path),
      })

      const packages = Object.entries(dependencies).map(([name, { path }]) => {
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
}

export class YarnDetector extends PackageManagerDetector implements PackageManager {
  get name (): string {
    return 'yarn'
  }

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('yarn/')
  }

  detectRuntime (): boolean {
    return false
  }

  get representativeLockfile (): string {
    return 'yarn.lock'
  }

  get representativeConfigFile (): undefined {
    return
  }

  async detectLockfile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeLockfile))
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

  execCommand (args: string[]): Runnable {
    return new Runnable('yarn', args)
  }

  async lookupWorkspace (dir: string): Promise<Workspace | undefined> {
    return await lookupNearestPackageJsonWorkspace(this, dir)
  }
}

export class DenoDetector extends PackageManagerDetector implements PackageManager {
  get name (): string {
    return 'deno'
  }

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('deno/')
  }

  detectRuntime (): boolean {
    return process.versions.deno !== undefined
  }

  get representativeLockfile (): string {
    return 'deno.lock'
  }

  get representativeConfigFile (): string {
    return 'deno.json'
  }

  async detectLockfile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeLockfile))
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

  detectUserAgent (userAgent: string): boolean {
    return userAgent.startsWith('bun/')
  }

  detectRuntime (): boolean {
    return process.versions.bun !== undefined
  }

  get representativeLockfile (): string {
    return 'bun.lockb'
  }

  get representativeConfigFile (): undefined {
    return
  }

  async detectLockfile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeLockfile))
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

  execCommand (args: string[]): Runnable {
    return new Runnable('bunx', args)
  }

  async lookupWorkspace (dir: string): Promise<Workspace | undefined> {
    return await lookupNearestPackageJsonWorkspace(this, dir)
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

// The order of the detectors is relevant to the lookup order.
export const knownPackageManagers: PackageManagerDetector[] = [
  new PNpmDetector(),
  new BunDetector(),
  new DenoDetector(),
  new YarnDetector(),
  new CNpmDetector(),
  npmPackageManager,
]

export interface DetectOptions {
  detectors?: PackageManagerDetector[]
  root?: string
}

export async function detectPackageManager (
  dir: string,
  options?: DetectOptions,
): Promise<PackageManager> {
  const detectors = options?.detectors ?? knownPackageManagers

  // Try user agent first.
  const userAgent = process.env['npm_config_user_agent']
  if (userAgent !== undefined) {
    for (const detector of detectors) {
      if (detector.detectUserAgent(userAgent)) {
        return detector
      }
    }
  }

  // Next, try runtime.
  for (const detector of detectors) {
    if (detector.detectRuntime()) {
      return detector
    }
  }

  // Next, try to find a lockfile.
  try {
    const { packageManager } = await detectNearestLockfile(dir, {
      detectors,
      root: options?.root,
    })

    return packageManager
  } catch {
    // Nothing detected.
  }

  // Next, try to find a config file.
  try {
    const { packageManager } = await detectNearestConfigFile(dir, {
      detectors,
      root: options?.root,
    })

    return packageManager
  } catch {
    // Nothing detected.
  }

  // Finally, try to find a relevant executable.
  //
  // This can generate a whole bunch of path lookups. Try one by one despite
  // async support.
  const lookup = new PathLookup()
  for (const detector of detectors) {
    try {
      await detector.detectExecutable(lookup)
      return detector
    } catch {
      continue
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

export async function detectNearestLockfile (
  dir: string,
  options?: DetectOptions,
): Promise<NearestLockFile> {
  const detectors = options?.detectors ?? knownPackageManagers

  const searchPaths: string[] = []

  // Next, try to find a lockfile.
  for (const searchPath of lineage(dir, { root: options?.root })) {
    try {
      searchPaths.push(searchPath)

      // Assume that only a single kind of lockfile exists, which means the
      // resolve order does not matter.
      return await Promise.any(detectors.map(async detector => {
        const lockfile = await detector.detectLockfile(searchPath)
        return {
          packageManager: detector,
          lockfile,
        }
      }))
    } catch {
      // Nothing detected.
    }
  }

  const lockfiles = detectors.reduce<string[]>((acc, detector) => {
    return acc.concat(detector.representativeLockfile ?? [])
  }, [])

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

export async function detectNearestConfigFile (
  dir: string,
  options?: DetectOptions,
): Promise<NearestConfigFile> {
  const detectors = options?.detectors ?? knownPackageManagers

  const searchPaths: string[] = []

  for (const searchPath of lineage(dir, { root: options?.root })) {
    try {
      searchPaths.push(searchPath)

      // Assume that only a single kind of config file exists, which means
      // the resolve order does not matter.
      return await Promise.any(detectors.map(async detector => {
        const configFile = await detector.detectConfigFile(searchPath)
        return {
          packageManager: detector,
          configFile,
        }
      }))
    } catch {
      // Nothing detected.
    }
  }

  const configFiles = detectors.reduce<string[]>((acc, detector) => {
    return acc.concat(detector.representativeConfigFile ?? [])
  }, [])

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
  const lockfile: OptionalWorkspaceFile = await detectNearestLockfile(options.root.path, {
    root: options.root.path,
    detectors: [detector],
  }).then(
    ({ lockfile }) => Ok(lockfile),
    reason => Err(reason),
  )

  const configFile: OptionalWorkspaceFile = await detectNearestConfigFile(options.root.path, {
    root: options.root.path,
    detectors: [detector],
  }).then(
    ({ configFile }) => Ok(configFile),
    reason => Err(reason),
  )

  return new Workspace({
    ...options,
    lockfile,
    configFile,
  })
}
