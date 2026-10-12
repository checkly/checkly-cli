import { PackageJsonFile } from './package-json-file.js'
import { lineage } from './walk.js'

// Kept separate from package-manager.ts so that callers that only need the
// nearest package.json (e.g. every command's engine check) don't load the
// package manager detection and its dependencies (execa, yaml, acorn).

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
