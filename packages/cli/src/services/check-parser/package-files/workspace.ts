import path from 'node:path'

import { glob } from 'glob'

import { PackageJsonFile } from './package-json-file'
import { lineage } from './walk'

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

export class Workspace {
  /**
   * The workspace root package.
   */
  root: Package

  /**
   * Packages that are a part of the workspace, excluding the root package.
   */
  packages: Package[]

  #membersByName = new Map<string, Package>()
  #membersByPath = new Map<string, Package>()

  constructor (root: Package, packages: Package[]) {
    this.root = root
    this.packages = packages
    this.#membersByName = [root, ...packages].reduce(
      (map, pkg) => map.set(pkg.name, pkg),
      new Map<string, Package>(),
    )
    this.#membersByPath = [root, ...packages].reduce(
      (map, pkg) => map.set(pkg.path, pkg),
      new Map<string, Package>(),
    )
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

export async function lookupNearestPackageJsonWorkspace (dir: string): Promise<Workspace | undefined> {
  for (const searchPath of lineage(dir)) {
    const rootPackage = await Package.loadFromDirPath(searchPath)
    if (!rootPackage) {
      continue
    }

    if (rootPackage.workspaces === undefined || rootPackage.workspaces.length === 0) {
      continue
    }

    const packages = await Workspace.resolvePatterns(searchPath, rootPackage.workspaces)

    return new Workspace(rootPackage, packages)
  }
}
