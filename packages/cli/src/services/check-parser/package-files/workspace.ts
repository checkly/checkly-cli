import path from 'node:path'

import { glob } from 'glob'

import { PackageJsonFile } from './package-json-file'
import { Result } from './result'

export interface PackageOptions {
  /**
   * The name of the package.
   */
  name: string

  /**
   * An absolute path to the package directory.
   */
  path: string

  /**
   * Whether the package is a workspace.
   */
  workspaces?: string[]
}

export class Package {
  name: string
  path: string
  workspaces?: string[]

  constructor ({ name, path, workspaces }: PackageOptions) {
    this.name = name
    this.path = path
    this.workspaces = workspaces
  }

  get packageJsonPath (): string {
    return PackageJsonFile.filePath(this.path)
  }

  // eslint-disable-next-line require-await
  static async loadFromPackageJsonFile (packageJson: PackageJsonFile): Promise<Package | undefined> {
    const { name, workspaces } = packageJson
    if (name === undefined) {
      return
    }

    return new Package({
      name,
      path: packageJson.meta.dirname,
      workspaces,
    })
  }

  static async loadFromDirPath (dirPath: string): Promise<Package | undefined> {
    const packageJson = await PackageJsonFile.loadFromFilePath(PackageJsonFile.filePath(dirPath))
    if (!packageJson) {
      return
    }

    return await Package.loadFromPackageJsonFile(packageJson)
  }
}

export type OptionalWorkspaceFile = Result<string, Error>

export interface WorkspaceOptions {
  root: Package
  packages: Package[]
  lockfile: OptionalWorkspaceFile
  configFile: OptionalWorkspaceFile
}

export class Workspace {
  /**
   * The workspace root package.
   */
  root: Package

  /**
   * Packages that are a part of the workspace, excluding the root package.
   */
  packages: Package[]

  /**
   * The package manager specific lockfile of the workspace.
   */
  lockfile: OptionalWorkspaceFile

  /**
   * The package manager specific config file of the workspace.
   */
  configFile: OptionalWorkspaceFile

  #membersByName = new Map<string, Package>()
  #membersByPath = new Map<string, Package>()

  constructor (options: WorkspaceOptions) {
    this.root = options.root
    this.packages = options.packages
    this.#membersByName = [options.root, ...options.packages].reduce(
      (map, pkg) => map.set(pkg.name, pkg),
      new Map<string, Package>(),
    )
    this.#membersByPath = [options.root, ...options.packages].reduce(
      (map, pkg) => map.set(pkg.path, pkg),
      new Map<string, Package>(),
    )
    this.lockfile = options.lockfile
    this.configFile = options.configFile
  }

  memberByName (name: string): Package | undefined {
    return this.#membersByName.get(name)
  }

  memberByPath (path: string): Package | undefined {
    return this.#membersByPath.get(path)
  }

  /**
   * @param root An absolute path to the workspace root.
   * @param patterns Relative workspace patterns.
   * @returns Absolute paths to every package in the workspace.
   */
  static async resolvePatterns (
    root: string,
    patterns: string[],
  ): Promise<Package[]> {
    const lookup = patterns.map(pattern =>
      path.join(pattern, PackageJsonFile.FILENAME),
    )

    const results = await glob(lookup, {
      cwd: root,
      absolute: true,
    })

    const packages: Package[] = []

    for (const result of results) {
      const packageJson = await PackageJsonFile.loadFromFilePath(result)
      if (packageJson === undefined) {
        continue
      }

      const workspacePackage = await Package.loadFromPackageJsonFile(packageJson)
      if (workspacePackage === undefined) {
        continue
      }

      packages.push(workspacePackage)
    }

    return packages
  }
}
