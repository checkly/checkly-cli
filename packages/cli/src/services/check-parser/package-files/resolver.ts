/* eslint-disable no-labels */

import path from 'node:path'

import { SourceFile } from './source-file'
import { PackageJsonFile } from './package-json-file'
import { TSConfigFile } from './tsconfig-json-file'
import { JSConfigFile } from './jsconfig-json-file'
import { isLocalPath, PathResult } from './paths'
import { FileLoader } from './loader'

class PackageFilesCache {
  packageJsonCache = new FileLoader(PackageJsonFile.loadFromFilePath)
  tsconfigJsonCache = new FileLoader(TSConfigFile.loadFromFilePath)
  jsconfigJsonCache = new FileLoader(JSConfigFile.loadFromFilePath)
}

class PackageFiles {
  packageJson?: PackageJsonFile
  tsconfigJson?: TSConfigFile
  jsconfigJson?: JSConfigFile

  satisfyFromDirPath (dirPath: string, cache: PackageFilesCache): boolean {
    if (this.packageJson === undefined) {
      this.packageJson = cache.packageJsonCache.load(PackageJsonFile.filePath(dirPath))
    }

    if (this.tsconfigJson === undefined && this.jsconfigJson === undefined) {
      this.tsconfigJson = cache.tsconfigJsonCache.load(TSConfigFile.filePath(dirPath))
    }

    if (this.jsconfigJson === undefined && this.tsconfigJson === undefined) {
      this.jsconfigJson = cache.jsconfigJsonCache.load(JSConfigFile.filePath(dirPath))
    }

    return this.satisfied
  }

  get satisfied (): boolean {
    // Never satisfied until we find a package.json file.
    if (this.packageJson === undefined) {
      return false
    }

    // Not satisfied until either a tsconfig.json or a jsconfig.json file
    // is found.
    if (this.tsconfigJson === undefined && this.jsconfigJson === undefined) {
      return false
    }

    return true
  }
}

type TSConfigResolvedPathLocalDependency = {
  kind: 'tsconfig-resolved-path'
  importPath: string
  sourceFile: SourceFile
  configFile: TSConfigFile
  pathResult: PathResult
}

type TSConfigBaseUrlRelativePathLocalDependency = {
  kind: 'tsconfig-baseurl-relative-path'
  importPath: string
  configFile: TSConfigFile
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
  cache = new PackageFilesCache()

  loadPackageFiles (filePath: string, options?: { root?: string }): PackageFiles {
    const files = new PackageFiles()

    let currentPath = filePath

    while (true) {
      const prevPath = currentPath

      currentPath = path.dirname(prevPath)

      // Bail out if we reach root.
      if (prevPath === currentPath) {
        break
      }

      // Try to find all files and stop if we do.
      if (files.satisfyFromDirPath(currentPath, this.cache)) {
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
      const packageJson = this.cache.packageJsonCache.load(sourceFile.meta.filePath)
      if (packageJson === undefined) {
        // This should never happen unless the package.json is invalid or
        // something.
        return [sourceFile]
      }

      // Go through each main path. A fallback path is included. If we can
      // find a tsconfig for the main file, look it up and attempt to find
      // the original TypeScript sources roughly the same way tsc does it.
      for (const mainPath of packageJson.mainPaths) {
        const { tsconfigJson, jsconfigJson } = this.loadPackageFiles(mainPath, {
          root: packageJson.basePath,
        })

        // TODO: Prefer jsconfig.json when dealing with a JavaScript file.
        for (const configJson of [tsconfigJson, jsconfigJson]) {
          if (configJson === undefined) {
            continue
          }

          const candidatePaths = configJson.collectLookupPaths(mainPath)
          for (const candidatePath of candidatePaths) {
            const mainSourceFile = SourceFile.loadFromFilePath(candidatePath)
            if (mainSourceFile === undefined) {
              continue
            }

            return [sourceFile, mainSourceFile]
          }
        }

        const mainSourceFile = SourceFile.loadFromFilePath(mainPath)
        if (mainSourceFile === undefined) {
          continue
        }

        return [sourceFile, mainSourceFile]
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

    const { packageJson, tsconfigJson, jsconfigJson } = this.loadPackageFiles(filePath)

    resolve:
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
            continue resolve
          }
        }
        resolved.missing.push({
          importPath,
          filePath: relativeDepPath,
        })
        continue resolve
      }

      // TODO: Prefer jsconfig.json when dealing with a JavaScript file.
      for (const configJson of [tsconfigJson, jsconfigJson]) {
        if (configJson === undefined) {
          continue
        }

        const resolvedPaths = configJson.resolvePath(importPath)
        if (resolvedPaths.length > 0) {
          let found = false
          for (const { source, target } of resolvedPaths) {
            const relativePath = path.resolve(configJson.basePath, target.path)
            const sourceFile = SourceFile.loadFromFilePath(relativePath, suffixes)
            if (sourceFile !== undefined) {
              const resolvedFiles = this.resolveSourceFile(sourceFile)
              for (const resolvedFile of resolvedFiles) {
                resolved.local.push({
                  kind: 'tsconfig-resolved-path',
                  importPath,
                  sourceFile: resolvedFile,
                  configFile: configJson,
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
            continue resolve
          }
        }

        if (configJson.baseUrl !== undefined) {
          const relativePath = path.resolve(configJson.basePath, configJson.baseUrl, importPath)
          const sourceFile = SourceFile.loadFromFilePath(relativePath, suffixes)
          if (sourceFile !== undefined) {
            const resolvedFiles = this.resolveSourceFile(sourceFile)
            let found = false
            for (const resolvedFile of resolvedFiles) {
              resolved.local.push({
                kind: 'tsconfig-baseurl-relative-path',
                importPath,
                sourceFile: resolvedFile,
                configFile: configJson,
              })
              found = true
            }
            if (found) {
              continue resolve
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
              continue resolve
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
