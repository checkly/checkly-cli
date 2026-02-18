import path from 'node:path'

import Debug from 'debug'

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
import { Package, Workspace } from './workspace'

const debug = Debug('checkly:cli:services:check-parser:resolver')

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
  neighbor: Package
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

type NeighborDependencies = {
  depends: Package[]
  references: Package[]
}

export type Dependencies = {
  external: ExternalDependency[]
  missing: MissingDependency[]
  local: LocalDependency[]
  neighbors: NeighborDependencies
}

interface ResolveSourceFileOptions {
  exportPath?: string
  source?: RawDependencySource
}

export interface PackageFilesResolverOptions {
  workspace?: Workspace
  restricted?: boolean
}

export class PackageFilesResolver {
  cache = new PackageFilesCache()
  workspace?: Workspace
  restricted: boolean

  constructor (options?: PackageFilesResolverOptions) {
    this.workspace = options?.workspace
    this.restricted = options?.restricted ?? false
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
    debug(`Resolving dependencies for %s`, filePath)

    const resolved: Dependencies = {
      external: [],
      missing: [],
      local: [],
      neighbors: {
        depends: [],
        references: [],
      },
    }

    const dirname = path.dirname(filePath)

    const {
      packageJson,
      tsconfigJson,
      jsconfigJson,
    } = await this.loadPackageFiles(filePath, {
      root: this.workspace?.root.path,
    })

    // Only add workspace files if we are not running in restricted mode.
    // Restricted mode is used by ApiChecks, BrowserChecks and MultiStepChecks.
    // In restricted mode, files are not bundled into a separate archive,
    // which means that including potentially large files like the lockfile
    // is going to significantly increase the payload size for no benefit,
    // since they do not currently even support installation of external
    // packages.
    if (this.workspace && !this.restricted) {
      const {
        packageJson,
        tsconfigJson,
        jsconfigJson,
      } = await this.loadPackageFiles(PackageJsonFile.filePath(this.workspace.root.path), {
        root: this.workspace.root.path,
      })

      if (packageJson) {
        debug('Found workspace root package.json file %s',
          packageJson.meta.filePath,
        )
        resolved.local.push({
          kind: 'workspace-root-package-json-file',
          importPath: filePath,
          sourceFile: packageJson.jsonFile.sourceFile,
          packageJsonFile: packageJson,
        })
      }

      if (tsconfigJson) {
        debug('Found workspace root tsconfig.json file %s',
          tsconfigJson.meta.filePath,
        )
        resolved.local.push({
          kind: 'workspace-root-tsconfig-file',
          importPath: filePath,
          sourceFile: tsconfigJson.jsonFile.sourceFile,
          configFile: tsconfigJson,
        })
      }

      if (jsconfigJson) {
        debug('Found workspace root jsconfig.json file %s',
          jsconfigJson.meta.filePath,
        )
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
          debug('Found workspace root lockfile %s',
            lockfile.meta.filePath,
          )
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
          debug('Found workspace root config file %s',
            configFile.meta.filePath,
          )
          resolved.local.push({
            kind: 'workspace-root-config-file',
            importPath: filePath,
            sourceFile: configFile,
          })
        }
      }
    }

    // As above, only add nearest package files if we are not running in
    // restricted mode.
    //
    // Including these files not only increases the size of the deployment,
    // but can also affect the way Node.js treats the code files. Mainly,
    // the package.json file can define whether the package uses CJS or ESM.
    // Since our legacy runners do not support ESM, this leads into a
    // compatibility issue. For tsconfig files, they will get included anyway
    // if they are necessary for TypeScript file resolution, so including them
    // here is not necessary in restricted mode.
    if (!this.restricted) {
      if (packageJson) {
        debug('Found nearest package.json file %s',
          packageJson.meta.filePath,
        )
        resolved.local.push({
          kind: 'nearest-package-json-file',
          importPath: filePath,
          sourceFile: packageJson.jsonFile.sourceFile,
          packageJsonFile: packageJson,
        })
      }

      if (tsconfigJson) {
        debug('Found nearest tsconfig.json file %s',
          tsconfigJson.meta.filePath,
        )
        resolved.local.push({
          kind: 'nearest-tsconfig-file',
          importPath: filePath,
          sourceFile: tsconfigJson.jsonFile.sourceFile,
          configFile: tsconfigJson,
        })
      }

      if (jsconfigJson) {
        debug('Found nearest jsconfig.json file %s',
          jsconfigJson.meta.filePath,
        )
        resolved.local.push({
          kind: 'nearest-tsconfig-file',
          importPath: filePath,
          sourceFile: jsconfigJson.jsonFile.sourceFile,
          configFile: jsconfigJson,
        })
      }
    }

    const usedNeighbors = new Set<Package>()

    const context = LookupContext.forFilePath(filePath)

    resolve:
    for (const { importPath, source } of dependencies) {
      if (isBuiltinPath(importPath)) {
        debug('Found built-in %s', importPath)
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
            debug('Found local file %s', resolvedFile.meta.filePath)
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
        debug('Failed to find local file %s', importPath)
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
                debug('Found tsconfig paths resolved file %s',
                  resolvedFile.meta.filePath,
                )
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
                debug('Found supporting tsconfig.json file %s (paths)',
                  configJson.meta.filePath,
                )
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
              debug('Found tsconfig baseUrl relative file %s',
                resolvedFile.meta.filePath,
              )
              resolved.local.push({
                kind: 'supporting-tsconfig-baseurl-relative-path',
                importPath,
                sourceFile: resolvedFile,
                configFile: configJson,
              })
              debug('Found supporting tsconfig file %s (baseUrl)',
                configJson.meta.filePath,
              )
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
        debug('Found local imports path %s',
          importPath,
        )

        // TODO
        continue resolve
      }

      if (this.workspace) {
        const { name, path: exportPath } = splitExternalPath(importPath)
        const neighbor = this.workspace.memberByName(name)
        if (neighbor) {
          const sourceFile = await this.cache.sourceFile(neighbor.path, context)
          if (sourceFile !== undefined) {
            const resolvedFiles = await this.resolveSourceFile(sourceFile, context, {
              exportPath,
              source,
            })
            let found = false
            for (const resolvedFile of resolvedFiles) {
              debug('Found workspace neighbor file %s', resolvedFile.meta.filePath)
              resolved.local.push({
                kind: 'workspace-neighbor',
                neighbor,
                importPath,
                sourceFile: resolvedFile,
              })
              found = true
            }
            if (found) {
              debug('Found workspace neighbor reference %s', neighbor.path)
              usedNeighbors.add(neighbor)
              continue resolve
            }
          }
        }
      }

      debug(`Found external dependency %s`, importPath)
      resolved.external.push({
        importPath,
      })
    }

    const requiredNeighbors = new Set<Package>()

    if (packageJson && this.workspace) {
      const combinedDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      }

      for (const dep of Object.keys(combinedDependencies)) {
        const neighbor = this.workspace.memberByName(dep)
        if (neighbor) {
          debug('Found workspace neighbor requirement %s', neighbor.path)
          requiredNeighbors.add(neighbor)
        }
      }
    }

    resolved.neighbors = {
      depends: Array.from(requiredNeighbors),
      references: Array.from(usedNeighbors),
    }

    return resolved
  }
}
