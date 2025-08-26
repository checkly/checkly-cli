import fs from 'node:fs/promises'
import path from 'node:path'

import { lineage } from './walk'

export class Runnable {
  executable: string
  args: string[]

  constructor (executable: string, args: string[]) {
    this.executable = executable
    this.args = args
  }

  get unsafeDisplayCommand (): string {
    return [this.executable, ...this.args.map(unsafeQuoteArg)].join(' ')
  }
}

/**
 * Quotes an argument for display purposes only.
 *
 * @returns The argument as-is if quoting is not required, or quoted otherwise.
 */
function unsafeQuoteArg (arg: string) {
  if (arg === '') {
    return `''`
  }

  if (!/[^%+,-./:=@_0-9A-Za-z]/.test(arg)) {
    return arg
  }

  return `'${arg.replaceAll(`'`, `'"'"'`)}'`
}

export interface PackageManager {
  get name (): string
  installCommand (): Runnable
  execCommand (args: string[]): Runnable
}

class NotDetectedError extends Error {}

export abstract class PackageManagerDetector {
  abstract get name (): string
  abstract detectUserAgent (userAgent: string): boolean
  abstract detectRuntime (): boolean
  abstract get representativeLockfile (): string | undefined
  abstract detectLockfile (dir: string): Promise<string>
  abstract detectExecutable (lookup: PathLookup): Promise<void>
  abstract installCommand (): Runnable
  abstract execCommand (args: string[]): Runnable
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

  async detectLockfile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeLockfile))
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

  // eslint-disable-next-line require-await
  async detectLockfile (): Promise<string> {
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

  async detectLockfile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeLockfile))
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

  async detectLockfile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeLockfile))
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

  async detectLockfile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeLockfile))
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

  async detectLockfile (dir: string): Promise<string> {
    return await accessR(path.join(dir, this.representativeLockfile))
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

const npmDetector = new NpmDetector()

// The order of the detectors is relevant to the lookup order.
export const knownPackageManagers: PackageManagerDetector[] = [
  new PNpmDetector(),
  new BunDetector(),
  new DenoDetector(),
  new YarnDetector(),
  new CNpmDetector(),
  npmDetector,
]

export interface DetectOptions {
  detectors?: PackageManagerDetector[]
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
  return npmDetector
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
  for (const searchPath of lineage(dir)) {
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
