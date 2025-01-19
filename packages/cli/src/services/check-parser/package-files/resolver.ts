/* eslint-disable no-labels */

import path from 'node:path'

import { SourceFile } from './source-file'
import { PackageJsonFile } from './package-json-file'
import { TSConfigFile } from './tsconfig-json-file'
import { JSConfigFile } from './jsconfig-json-file'
import { isLocalPath, PathResult } from './paths'
import { FileLoader, LoadFile } from './loader'
import { JsonSourceFile } from './json-source-file'
import { LookupContext } from './lookup'

class PackageFilesCache {
  #sourceFileCache = new FileLoader(SourceFile.loadFromFilePath)

  #jsonFileLoader<T, S> (load: (jsonFile: JsonSourceFile<S>) => T | undefined): LoadFile<T> {
    return filePath => {
      const sourceFile = this.#sourceFileCache.load(filePath)
      if (sourceFile === undefined) {
        return
      }

      const jsonFile = JsonSourceFile.loadFromSourceFile<S>(sourceFile)
      if (jsonFile === undefined) {
        return
      }

      return load(jsonFile)
    }
  }

  #packageJsonCache = new FileLoader(this.#jsonFileLoader(PackageJsonFile.loadFromJsonSourceFile))
  #tsconfigJsonCache = new FileLoader(this.#jsonFileLoader(TSConfigFile.loadFromJsonSourceFile))
  #jsconfigJsonCache = new FileLoader(this.#jsonFileLoader(JSConfigFile.loadFromJsonSourceFile))

  sourceFile (filePath: string, context: LookupContext) {
    for (const lookupPath of context.collectLookupPaths(filePath)) {
      const sourceFile = this.#sourceFileCache.load(lookupPath)
      if (sourceFile === undefined) {
        continue
      }

      return sourceFile
    }
  }

  packageJson (filePath: string) {
    return this.#packageJsonCache.load(filePath)
  }

  tsconfigJson (filePath: string) {
    return this.#tsconfigJsonCache.load(filePath)
  }

  jsconfigJson (filePath: string) {
    return this.#jsconfigJsonCache.load(filePath)
  }
}

class PackageFiles {
  packageJson?: PackageJsonFile
  tsconfigJson?: TSConfigFile
  jsconfigJson?: JSConfigFile

  satisfyFromDirPath (dirPath: string, cache: PackageFilesCache): boolean {
    if (this.packageJson === undefined) {
      this.packageJson = cache.packageJson(PackageJsonFile.filePath(dirPath))
    }

    if (this.tsconfigJson === undefined && this.jsconfigJson === undefined) {
      this.tsconfigJson = cache.tsconfigJson(TSConfigFile.filePath(dirPath))
    }

    if (this.jsconfigJson === undefined && this.tsconfigJson === undefined) {
      this.jsconfigJson = cache.jsconfigJson(JSConfigFile.filePath(dirPath))
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

type TSConfigFileLocalDependency = {
  kind: 'tsconfig-file'
  importPath: string
  sourceFile: SourceFile
  configFile: TSConfigFile
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

type RelativePathLocalDependency = {
  kind: 'relative-path'
  importPath: string
  sourceFile: SourceFile
}

type LocalDependency =
  TSConfigFileLocalDependency |
  TSConfigResolvedPathLocalDependency |
  TSConfigBaseUrlRelativePathLocalDependency |
  RelativePathLocalDependency

type MissingDependency = {
  importPath: string,
  filePath: string,
}

type ExternalDependency = {
  importPath: string
}

export type Dependencies = {
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

  private resolveSourceFile (sourceFile: SourceFile, context: LookupContext): SourceFile[] {
    if (sourceFile.meta.basename === PackageJsonFile.FILENAME) {
      const packageJson = this.cache.packageJson(sourceFile.meta.filePath)
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

          const candidatePaths = configJson.collectLookupPaths(mainPath).flatMap(filePath => {
            return context.collectLookupPaths(filePath)
          })
          for (const candidatePath of candidatePaths) {
            const mainSourceFile = this.cache.sourceFile(candidatePath, context)
            if (mainSourceFile === undefined) {
              continue
            }

            configJson.registerRelatedSourceFile(mainSourceFile)

            return [sourceFile, mainSourceFile, configJson.jsonFile.sourceFile]
          }
        }

        const mainSourceFile = this.cache.sourceFile(mainPath, context)
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
  ): Dependencies {
    const resolved: Dependencies = {
      external: [],
      missing: [],
      local: [],
    }

    const dirname = path.dirname(filePath)

    const { tsconfigJson, jsconfigJson } = this.loadPackageFiles(filePath)

    const context = LookupContext.forFilePath(filePath)

    resolve:
    for (const importPath of dependencies) {
      if (isLocalPath(importPath)) {
        const relativeDepPath = path.resolve(dirname, importPath)
        const sourceFile = this.cache.sourceFile(relativeDepPath, context)
        if (sourceFile !== undefined) {
          const resolvedFiles = this.resolveSourceFile(sourceFile, context)
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

      for (const configJson of [tsconfigJson, jsconfigJson]) {
        if (configJson === undefined) {
          continue
        }

        const resolvedPaths = configJson.resolvePath(importPath)
        if (resolvedPaths.length > 0) {
          let found = false
          for (const { source, target } of resolvedPaths) {
            const relativePath = path.resolve(configJson.basePath, target.path)
            const sourceFile = this.cache.sourceFile(relativePath, context)
            if (sourceFile !== undefined) {
              const resolvedFiles = this.resolveSourceFile(sourceFile, context)
              for (const resolvedFile of resolvedFiles) {
                configJson.registerRelatedSourceFile(resolvedFile)
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
                resolved.local.push({
                  kind: 'tsconfig-file',
                  importPath,
                  sourceFile: configJson.jsonFile.sourceFile,
                  configFile: configJson,
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
          const sourceFile = this.cache.sourceFile(relativePath, context)
          if (sourceFile !== undefined) {
            const resolvedFiles = this.resolveSourceFile(sourceFile, context)
            let found = false
            for (const resolvedFile of resolvedFiles) {
              configJson.registerRelatedSourceFile(resolvedFile)
              resolved.local.push({
                kind: 'tsconfig-baseurl-relative-path',
                importPath,
                sourceFile: resolvedFile,
                configFile: configJson,
              })
              resolved.local.push({
                kind: 'tsconfig-file',
                importPath,
                sourceFile: configJson.jsonFile.sourceFile,
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

      resolved.external.push({
        importPath,
      })
    }

    return resolved
  }
}
