import path from 'node:path'

import { SourceFile } from './source-file'
import { PackageJsonFile } from './package-json-file'
import { TSConfigFile } from './tsconfig-json-file'
import { JSConfigFile } from './jsconfig-json-file'
import { isBuiltinPath, isImportsPath, isLocalPath, PathResult, splitExternalPath } from './paths'
import { FileLoader, LoadFile } from './loader'
import { JsonSourceFile } from './json-source-file'
import { JsonTextSourceFile } from './json-text-source-file'
import { LookupContext } from './lookup'
import { lineage, LineageOptions } from './walk'
import { Workspace } from './workspace'
import { PackageManager } from './package-manager'

class PackageFilesCache {
  #sourceFileCache = new FileLoader(SourceFile.loadFromFilePath)

  #fileLoader<T> (load: (sourceFile: SourceFile) => Promise<T | undefined>): LoadFile<T> {
    return async filePath => {
      const sourceFile = await this.#sourceFileCache.load(filePath)
      if (sourceFile === undefined) {
        return
      }

      return load(sourceFile)
    }
  }

  #jsonFileLoader<T, S> (load: (jsonFile: JsonSourceFile<S>) => Promise<T | undefined>): LoadFile<T> {
    return this.#fileLoader(async sourceFile => {
      const jsonFile = await JsonSourceFile.loadFromSourceFile<S>(sourceFile)
      if (jsonFile === undefined) {
        return
      }

      return load(jsonFile)
    })
  }

  #jsonTextFileLoader<T, S> (load: (jsonFile: JsonTextSourceFile<S>) => Promise<T | undefined>): LoadFile<T> {
    return this.#fileLoader(async sourceFile => {
      const jsonFile = await JsonTextSourceFile.loadFromSourceFile<S>(sourceFile)
      if (jsonFile === undefined) {
        return
      }

      return load(jsonFile)
    })
  }

  #packageJsonCache = new FileLoader(this.#jsonFileLoader(PackageJsonFile.loadFromJsonSourceFile))
  #tsconfigJsonCache = new FileLoader(this.#jsonTextFileLoader(TSConfigFile.loadFromJsonTextSourceFile))
  #jsconfigJsonCache = new FileLoader(this.#jsonFileLoader(JSConfigFile.loadFromJsonSourceFile))

  async exactSourceFile (filePath: string): Promise<SourceFile | undefined> {
    return await this.#sourceFileCache.load(filePath)
  }

  async sourceFile (filePath: string, context: LookupContext): Promise<SourceFile | undefined> {
    for (const lookupPath of context.collectLookupPaths(filePath)) {
      const sourceFile = await this.exactSourceFile(lookupPath)
      if (sourceFile === undefined) {
        continue
      }

      return sourceFile
    }
  }

  async packageJson (filePath: string): Promise<PackageJsonFile | undefined> {
    return await this.#packageJsonCache.load(filePath)
  }

  async tsconfigJson (filePath: string): Promise<TSConfigFile | undefined> {
    return await this.#tsconfigJsonCache.load(filePath)
  }

  async jsconfigJson (filePath: string): Promise<JSConfigFile | undefined> {
    return await this.#jsconfigJsonCache.load(filePath)
  }
}

class PackageFiles {
  packageJson?: PackageJsonFile
  tsconfigJson?: TSConfigFile
  jsconfigJson?: JSConfigFile

  async satisfyFromDirPath (dirPath: string, cache: PackageFilesCache): Promise<boolean> {
    if (this.packageJson === undefined) {
      this.packageJson = await cache.packageJson(PackageJsonFile.filePath(dirPath))
    }

    if (this.tsconfigJson === undefined && this.jsconfigJson === undefined) {
      this.tsconfigJson = await cache.tsconfigJson(TSConfigFile.filePath(dirPath))
    }

    if (this.jsconfigJson === undefined && this.tsconfigJson === undefined) {
      this.jsconfigJson = await cache.jsconfigJson(JSConfigFile.filePath(dirPath))
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

export type RawDependencySource = 'require' | 'import'

export type RawDependency = {
  importPath: string
  source: RawDependencySource
}

type WorkspaceRootPackageJsonFileLocalDependency = {
  kind: 'workspace-root-package-json-file'
  importPath: string
  sourceFile: SourceFile
  packageJsonFile: PackageJsonFile
}

type WorkspaceRootTSConfigFileLocalDependency = {
  kind: 'workspace-root-tsconfig-file'
  importPath: string
  sourceFile: SourceFile
  configFile: TSConfigFile
}

type WorkspaceRootLockfileLocalDependency = {
  kind: 'workspace-root-lockfile'
  importPath: string
  sourceFile: SourceFile
}

type WorkspaceRootConfigFileLocalDependency = {
  kind: 'workspace-root-config-file'
  importPath: string
  sourceFile: SourceFile
}

type NearestPackageJsonFileLocalDependency = {
  kind: 'nearest-package-json-file'
  importPath: string
  sourceFile: SourceFile
  packageJsonFile: PackageJsonFile
}

type NearestTSConfigFileLocalDependency = {
  kind: 'nearest-tsconfig-file'
  importPath: string
  sourceFile: SourceFile
  configFile: TSConfigFile
}

type SupportingTSConfigFileLocalDependency = {
  kind: 'supporting-tsconfig-file'
  importPath: string
  sourceFile: SourceFile
  configFile: TSConfigFile
}

type SupportingTSConfigResolvedPathLocalDependency = {
  kind: 'supporting-tsconfig-resolved-path'
  importPath: string
  sourceFile: SourceFile
  configFile: TSConfigFile
  pathResult: PathResult
}

type SupportingTSConfigBaseUrlRelativePathLocalDependency = {
  kind: 'supporting-tsconfig-baseurl-relative-path'
  importPath: string
  configFile: TSConfigFile
  sourceFile: SourceFile
}

type RelativePathLocalDependency = {
  kind: 'relative-path'
  importPath: string
  sourceFile: SourceFile
}

type WorkspaceNeighborLocalDependency = {
  kind: 'workspace-neighbor'
  importPath: string
  sourceFile: SourceFile
}

type LocalDependency =
  | WorkspaceRootPackageJsonFileLocalDependency
  | WorkspaceRootTSConfigFileLocalDependency
  | WorkspaceRootLockfileLocalDependency
  | WorkspaceRootConfigFileLocalDependency
  | NearestPackageJsonFileLocalDependency
  | NearestTSConfigFileLocalDependency
  | SupportingTSConfigFileLocalDependency
  | SupportingTSConfigResolvedPathLocalDependency
  | SupportingTSConfigBaseUrlRelativePathLocalDependency
  | RelativePathLocalDependency
  | WorkspaceNeighborLocalDependency

type MissingDependency = {
  importPath: string
  filePath: string
}

type ExternalDependency = {
  importPath: string
}

export type Dependencies = {
  external: ExternalDependency[]
  missing: MissingDependency[]
  local: LocalDependency[]
}

interface ResolveSourceFileOptions {
  exportPath?: string
  source?: RawDependencySource
}

export interface PackageFilesResolverOptions {
  workspace?: Workspace
}

export class PackageFilesResolver {
  cache = new PackageFilesCache()
  workspace?: Workspace

  constructor (options?: PackageFilesResolverOptions) {
    this.workspace = options?.workspace
  }

  async loadPackageFiles (filePath: string, options?: LineageOptions): Promise<PackageFiles> {
    const files = new PackageFiles()

    for (const searchPath of lineage(path.dirname(filePath), options)) {
      const found = await files.satisfyFromDirPath(searchPath, this.cache)
      if (found) {
        break
      }
    }

    return files
  }

  private async resolveSourceFile (
    sourceFile: SourceFile,
    context: LookupContext,
    options?: ResolveSourceFileOptions,
  ): Promise<SourceFile[]> {
    if (sourceFile.meta.basename === PackageJsonFile.FILENAME) {
      const packageJson = await this.cache.packageJson(sourceFile.meta.filePath)
      if (packageJson === undefined) {
        // This should never happen unless the package.json is invalid or
        // something.
        return [sourceFile]
      }

      const {
        exportPath = '',
        source = 'import',
      } = options ?? {}

      const searchPaths: string[] = []

      if (packageJson.hasExports()) {
        const { root, paths } = packageJson.resolveExportPath(exportPath, [
          source,
          'node',
          'module-sync',
          'default',
        ])

        for (const { target: targetPath } of paths) {
          searchPaths.push(path.resolve(root, targetPath.path))
        }
      }

      if (searchPaths.length === 0 && exportPath === '') {
        searchPaths.push(...packageJson.mainPaths)
      }

      // Go through each main path. A fallback path is included. If we can
      // find a tsconfig for the main file, look it up and attempt to find
      // the original TypeScript sources roughly the same way tsc does it.
      for (const searchPath of searchPaths) {
        const { tsconfigJson, jsconfigJson } = await this.loadPackageFiles(searchPath, {
          root: packageJson.basePath,
        })

        // TODO: Prefer jsconfig.json when dealing with a JavaScript file.
        for (const configJson of [tsconfigJson, jsconfigJson]) {
          if (configJson === undefined) {
            continue
          }

          const candidatePaths = configJson.collectLookupPaths(searchPath).flatMap(filePath => {
            return context.collectLookupPaths(filePath)
          })
          for (const candidatePath of candidatePaths) {
            const mainSourceFile = await this.cache.sourceFile(candidatePath, context)
            if (mainSourceFile === undefined) {
              continue
            }

            configJson.registerRelatedSourceFile(mainSourceFile)

            return [sourceFile, mainSourceFile, configJson.jsonFile.sourceFile]
          }
        }

        const mainSourceFile = await this.cache.sourceFile(searchPath, context)
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

  async resolveDependenciesForFilePath (
    filePath: string,
    dependencies: RawDependency[],
  ): Promise<Dependencies> {
    const resolved: Dependencies = {
      external: [],
      missing: [],
      local: [],
    }

    const dirname = path.dirname(filePath)

    const {
      packageJson,
      tsconfigJson,
      jsconfigJson,
    } = await this.loadPackageFiles(filePath, {
      root: this.workspace?.root.path,
    })

    if (this.workspace) {
      const {
        packageJson,
        tsconfigJson,
        jsconfigJson,
      } = await this.loadPackageFiles(PackageJsonFile.filePath(this.workspace.root.path))

      if (packageJson) {
        resolved.local.push({
          kind: 'workspace-root-package-json-file',
          importPath: filePath,
          sourceFile: packageJson.jsonFile.sourceFile,
          packageJsonFile: packageJson,
        })
      }

      if (tsconfigJson) {
        resolved.local.push({
          kind: 'workspace-root-tsconfig-file',
          importPath: filePath,
          sourceFile: tsconfigJson.jsonFile.sourceFile,
          configFile: tsconfigJson,
        })
      }

      if (jsconfigJson) {
        resolved.local.push({
          kind: 'workspace-root-tsconfig-file',
          importPath: filePath,
          sourceFile: jsconfigJson.jsonFile.sourceFile,
          configFile: jsconfigJson,
        })
      }

      if (this.workspace.lockfile.isOk()) {
        const lockfile = await this.cache.exactSourceFile(
          this.workspace.lockfile.ok(),
        )
        if (lockfile !== undefined) {
          resolved.local.push({
            kind: 'workspace-root-lockfile',
            importPath: filePath,
            sourceFile: lockfile,
          })
        }
      }

      if (this.workspace.configFile.isOk()) {
        const configFile = await this.cache.exactSourceFile(
          this.workspace.configFile.ok(),
        )
        if (configFile !== undefined) {
          resolved.local.push({
            kind: 'workspace-root-config-file',
            importPath: filePath,
            sourceFile: configFile,
          })
        }
      }
    }

    if (packageJson) {
      resolved.local.push({
        kind: 'nearest-package-json-file',
        importPath: filePath,
        sourceFile: packageJson.jsonFile.sourceFile,
        packageJsonFile: packageJson,
      })
    }

    if (tsconfigJson) {
      resolved.local.push({
        kind: 'nearest-tsconfig-file',
        importPath: filePath,
        sourceFile: tsconfigJson.jsonFile.sourceFile,
        configFile: tsconfigJson,
      })
    }

    if (jsconfigJson) {
      resolved.local.push({
        kind: 'nearest-tsconfig-file',
        importPath: filePath,
        sourceFile: jsconfigJson.jsonFile.sourceFile,
        configFile: jsconfigJson,
      })
    }

    const context = LookupContext.forFilePath(filePath)

    resolve:
    for (const { importPath, source } of dependencies) {
      if (isBuiltinPath(importPath)) {
        resolved.external.push({
          importPath,
        })
        continue resolve
      }

      if (isLocalPath(importPath)) {
        const relativeDepPath = path.resolve(dirname, importPath)
        const sourceFile = await this.cache.sourceFile(relativeDepPath, context)
        if (sourceFile !== undefined) {
          const resolvedFiles = await this.resolveSourceFile(sourceFile, context)
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

        const { root, paths: resolvedPaths } = configJson.resolvePath(importPath)
        if (resolvedPaths.length > 0) {
          let found = false
          for (const { source, target } of resolvedPaths) {
            const relativePath = path.resolve(root, target.path)
            const sourceFile = await this.cache.sourceFile(relativePath, context)
            if (sourceFile !== undefined) {
              const resolvedFiles = await this.resolveSourceFile(sourceFile, context)
              for (const resolvedFile of resolvedFiles) {
                configJson.registerRelatedSourceFile(resolvedFile)
                resolved.local.push({
                  kind: 'supporting-tsconfig-resolved-path',
                  importPath,
                  sourceFile: resolvedFile,
                  configFile: configJson,
                  pathResult: {
                    source,
                    target,
                  },
                })
                resolved.local.push({
                  kind: 'supporting-tsconfig-file',
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
          const sourceFile = await this.cache.sourceFile(relativePath, context)
          if (sourceFile !== undefined) {
            const resolvedFiles = await this.resolveSourceFile(sourceFile, context)
            let found = false
            for (const resolvedFile of resolvedFiles) {
              configJson.registerRelatedSourceFile(resolvedFile)
              resolved.local.push({
                kind: 'supporting-tsconfig-baseurl-relative-path',
                importPath,
                sourceFile: resolvedFile,
                configFile: configJson,
              })
              resolved.local.push({
                kind: 'supporting-tsconfig-file',
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

      if (isImportsPath(importPath)) {
        // TODO
        continue resolve
      }

      if (this.workspace) {
        const { name, path: exportPath } = splitExternalPath(importPath)
        const pkg = this.workspace.memberByName(name)
        if (pkg) {
          const sourceFile = await this.cache.sourceFile(pkg.path, context)
          if (sourceFile !== undefined) {
            const resolvedFiles = await this.resolveSourceFile(sourceFile, context, {
              exportPath,
              source,
            })
            let found = false
            for (const resolvedFile of resolvedFiles) {
              resolved.local.push({
                kind: 'workspace-neighbor',
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
