import path from 'node:path'

import { SourceFile } from './source-file'
import { PackageJsonFile } from './package-json-file'
import { TSConfigFile } from './tsconfig-json-file'
import { isLocalPath, PathResult } from './paths'
import { FileLoader } from './loader'

type PackageFiles = {
  packageJson?: PackageJsonFile
  tsconfigJson?: TSConfigFile
}

type TSConfigResolvedPathLocalDependency = {
  kind: 'tsconfig-resolved-path'
  importPath: string
  sourceFile: SourceFile
  pathResult: PathResult
}

type TSConfigBaseUrlRelativePathLocalDependency = {
  kind: 'tsconfig-baseurl-relative-path'
  importPath: string
  sourceFile: SourceFile
}

type PackageRelativePathLocalDependency = {
  kind: 'package-relative-path'
  importPath: string
  sourceFile: SourceFile
}

type RelativePathLocalDependency = {
  kind: 'relative-path'
  importPath: string
  sourceFile: SourceFile
}

type LocalDependency =
  TSConfigResolvedPathLocalDependency |
  TSConfigBaseUrlRelativePathLocalDependency |
  PackageRelativePathLocalDependency |
  RelativePathLocalDependency

type MissingDependency = {
  importPath: string,
  filePath: string,
}

type ExternalDependency = {
  importPath: string
}

type Dependencies = {
  external: ExternalDependency[],
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

  private resolveSourceFile (sourceFile: SourceFile): SourceFile[] {
    if (sourceFile.meta.basename === PackageJsonFile.FILENAME) {
      const packageJson = this.packageJsonCache.load(sourceFile.meta.filePath)
      if (packageJson === undefined) {
        // This should never happen unless the package.json is invalid or
        // something.
        return [sourceFile]
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

          return [sourceFile, mainSourceFile]
        }

        const candidatePaths = tsconfigJson.collectLookupPaths(mainPath)
        for (const candidatePath of candidatePaths) {
          const mainSourceFile = SourceFile.loadFromFilePath(candidatePath)
          if (mainSourceFile === undefined) {
            continue
          }

          return [sourceFile, mainSourceFile]
        }
      }

      // TODO: Is this even useful without any code files?
      return [sourceFile]
    }

    return [sourceFile]
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

    for (const importPath of dependencies) {
      if (isLocalPath(importPath)) {
        const relativeDepPath = path.resolve(dirname, importPath)
        const sourceFile = SourceFile.loadFromFilePath(relativeDepPath, suffixes)
        if (sourceFile !== undefined) {
          const resolvedFiles = this.resolveSourceFile(sourceFile)
          let found = false
          for (const resolvedFile of resolvedFiles) {
            resolved.local.push({
              kind: 'relative-path',
              importPath,
              sourceFile: resolvedFile,
            })
            found = true
          }
          if (found) {
            continue
          }
        }
        resolved.missing.push({
          importPath,
          filePath: relativeDepPath,
        })
        continue
      }

      if (tsconfigJson !== undefined) {
        const resolvedPaths = tsconfigJson.resolvePath(importPath)
        if (resolvedPaths.length > 0) {
          let found = false
          for (const { source, target } of resolvedPaths) {
            const relativePath = path.resolve(tsconfigJson.basePath, target.path)
            const sourceFile = SourceFile.loadFromFilePath(relativePath, suffixes)
            if (sourceFile !== undefined) {
              const resolvedFiles = this.resolveSourceFile(sourceFile)
              for (const resolvedFile of resolvedFiles) {
                resolved.local.push({
                  kind: 'tsconfig-resolved-path',
                  importPath,
                  sourceFile: resolvedFile,
                  pathResult: {
                    source,
                    target,
                  },
                })
                found = true
              }
              if (found) {
                // We're trying to find the first match out of many possible
                // candidates. Stop once we find a match.
                break
              }
            }
          }
          if (found) {
            continue
          }
        }

        if (tsconfigJson.baseUrl !== undefined) {
          const relativePath = path.resolve(tsconfigJson.basePath, tsconfigJson.baseUrl, importPath)
          const sourceFile = SourceFile.loadFromFilePath(relativePath, suffixes)
          if (sourceFile !== undefined) {
            const resolvedFiles = this.resolveSourceFile(sourceFile)
            let found = false
            for (const resolvedFile of resolvedFiles) {
              resolved.local.push({
                kind: 'tsconfig-baseurl-relative-path',
                importPath,
                sourceFile: resolvedFile,
              })
              found = true
            }
            if (found) {
              continue
            }
          }
        }
      }

      if (packageJson !== undefined) {
        if (packageJson.supportsPackageRelativePaths()) {
          const relativePath = path.resolve(packageJson.basePath, importPath)
          const sourceFile = SourceFile.loadFromFilePath(relativePath, suffixes)
          if (sourceFile !== undefined) {
            const resolvedFiles = this.resolveSourceFile(sourceFile)
            let found = false
            for (const resolvedFile of resolvedFiles) {
              resolved.local.push({
                kind: 'package-relative-path',
                importPath,
                sourceFile: resolvedFile,
              })
              found = true
            }
            if (found) {
              continue
            }
          }
        }
      }

      resolved.external.push({
        importPath,
      })
    }

    return resolved
  }
}
