import path from 'node:path'

import { SourceFile } from './source-file'
import { PackageJsonFile } from './package-json-file'
import { TSConfigFile } from './tsconfig-json-file'
import { isLocalPath } from './paths'
import { FileLoader } from './loader'

type PackageFiles = {
  packageJson?: PackageJsonFile
  tsconfigJson?: TSConfigFile
}

type Origin =
  'tsconfig-resolved-path' | 'tsconfig-baseurl-relative-path' | 'package-relative-path' | 'relative-path'

type LocalDependency = {
  sourceFile: SourceFile,
  origin: Origin,
}

type MissingDependency = {
  spec: string,
  filePath: string,
}

type Dependencies = {
  external: string[],
  missing: MissingDependency[],
  local: LocalDependency[],
}

export class PackageFilesResolver {
  packageJsonCache = new FileLoader(PackageJsonFile.loadFromFilePath)
  tsconfigJsonCache = new FileLoader(TSConfigFile.loadFromFilePath)

  loadPackageFiles (filePath: string, options?: { root?: string }): PackageFiles {
    const files: PackageFiles = {}

    let currentPath = filePath

    while (true) {
      const prevPath = currentPath

      currentPath = path.dirname(prevPath)

      // Bail out if we reach root.
      if (prevPath === currentPath) {
        break
      }

      if (files.packageJson === undefined) {
        files.packageJson = this.packageJsonCache.load(PackageJsonFile.filePath(currentPath))
      }

      if (files.tsconfigJson === undefined) {
        files.tsconfigJson = this.tsconfigJsonCache.load(TSConfigFile.filePath(currentPath))
      }

      // Stop if we've found all files.
      if (files.packageJson !== undefined && files.tsconfigJson !== undefined) {
        break
      }

      // Stop if we reach the user-specified root directory.
      // TODO: I don't like a string comparison for this but it'll do for now.
      if (currentPath === options?.root) {
        break
      }
    }

    return files
  }

  private resolveSourceFile (sourceFile: SourceFile): SourceFile | undefined {
    if (sourceFile.meta.basename === PackageJsonFile.FILENAME) {
      const packageJson = this.packageJsonCache.load(sourceFile.meta.filePath)
      if (packageJson === undefined) {
        return sourceFile
      }

      // Go through each main path. A fallback path is included. If we can
      // find a tsconfig for the main file, look it up and attempt to find
      // the original TypeScript sources roughly the same way tsc does it.
      for (const mainPath of packageJson.mainPaths) {
        const { tsconfigJson } = this.loadPackageFiles(mainPath, {
          root: packageJson.basePath,
        })

        if (tsconfigJson === undefined) {
          const mainSourceFile = SourceFile.loadFromFilePath(mainPath)
          if (mainSourceFile === undefined) {
            continue
          }

          return mainSourceFile
        }

        const candidatePaths = tsconfigJson.collectLookupPaths(mainPath)
        for (const candidatePath of candidatePaths) {
          const mainSourceFile = SourceFile.loadFromFilePath(candidatePath)
          if (mainSourceFile === undefined) {
            continue
          }

          return mainSourceFile
        }
      }

      return undefined
    }

    return sourceFile
  }

  resolveDependenciesForFilePath (
    filePath: string,
    dependencies: string[],
    suffixes: string[],
  ): Dependencies {
    const resolved: Dependencies = {
      external: [],
      missing: [],
      local: [],
    }

    const dirname = path.dirname(filePath)

    const { packageJson, tsconfigJson } = this.loadPackageFiles(filePath)

    for (const dep of dependencies) {
      if (isLocalPath(dep)) {
        const relativeDepPath = path.resolve(dirname, dep)
        const sourceFile = SourceFile.loadFromFilePath(relativeDepPath, suffixes)
        if (sourceFile !== undefined) {
          const resolvedFile = this.resolveSourceFile(sourceFile)
          if (resolvedFile !== undefined) {
            resolved.local.push({
              sourceFile: resolvedFile,
              origin: 'relative-path',
            })
            continue
          }
        }
        resolved.missing.push({
          spec: dep,
          filePath: relativeDepPath,
        })
        continue
      }

      if (tsconfigJson !== undefined) {
        const resolvedPaths = tsconfigJson.resolvePath(dep)
        if (resolvedPaths.length > 0) {
          let found = false
          for (const resolvedPath of resolvedPaths) {
            const relativePath = path.resolve(tsconfigJson.basePath, resolvedPath)
            const sourceFile = SourceFile.loadFromFilePath(relativePath, suffixes)
            if (sourceFile !== undefined) {
              const resolvedFile = this.resolveSourceFile(sourceFile)
              if (resolvedFile !== undefined) {
                resolved.local.push({
                  sourceFile: resolvedFile,
                  origin: 'tsconfig-resolved-path',
                })
                found = true
                break // We only need the first match that exists.
              }
            }
          }
          if (found) {
            continue
          }
        }

        if (tsconfigJson.baseUrl !== undefined) {
          const relativePath = path.resolve(tsconfigJson.basePath, tsconfigJson.baseUrl, dep)
          const sourceFile = SourceFile.loadFromFilePath(relativePath, suffixes)
          if (sourceFile !== undefined) {
            const resolvedFile = this.resolveSourceFile(sourceFile)
            if (resolvedFile !== undefined) {
              resolved.local.push({
                sourceFile: resolvedFile,
                origin: 'tsconfig-baseurl-relative-path',
              })
              continue
            }
          }
        }
      }

      if (packageJson !== undefined) {
        if (packageJson.supportsPackageRelativePaths()) {
          const relativePath = path.resolve(packageJson.basePath, dep)
          const sourceFile = SourceFile.loadFromFilePath(relativePath, suffixes)
          if (sourceFile !== undefined) {
            const resolvedFile = this.resolveSourceFile(sourceFile)
            if (resolvedFile !== undefined) {
              resolved.local.push({
                sourceFile: resolvedFile,
                origin: 'package-relative-path',
              })
              continue
            }
          }
        }
      }

      resolved.external.push(dep)
    }

    return resolved
  }
}
