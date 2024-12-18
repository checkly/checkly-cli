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

  async loadPackageFiles (filePath: string): Promise<PackageFiles> {
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
        files.packageJson = await this.packageJsonCache.load(PackageJsonFile.filePath(currentPath))
      }

      if (files.tsconfigJson === undefined) {
        files.tsconfigJson = await this.tsconfigJsonCache.load(TSConfigFile.filePath(currentPath))
      }

      // Stop if we've found all files.
      if (files.packageJson !== undefined && files.tsconfigJson !== undefined) {
        break
      }
    }

    return files
  }

  private async resolveSourceFile (sourceFile: SourceFile): Promise<SourceFile> {
    if (sourceFile.meta.basename === PackageJsonFile.FILENAME) {
      const packageJson = await this.packageJsonCache.load(sourceFile.meta.filePath)
      if (packageJson === undefined) {
        return sourceFile
      }

      const mainSourceFile = await SourceFile.loadFromFilePath(packageJson.mainPath())
      if (mainSourceFile === undefined) {
        return sourceFile
      }

      return mainSourceFile
    }

    return sourceFile
  }

  async resolveDependenciesForFilePath (
    filePath: string,
    dependencies: string[],
    suffixes: string[],
  ): Promise<Dependencies> {
    const resolved: Dependencies = {
      external: [],
      missing: [],
      local: [],
    }

    const dirname = path.dirname(filePath)

    const { packageJson, tsconfigJson } = await this.loadPackageFiles(filePath)

    for (const dep of dependencies) {
      if (isLocalPath(dep)) {
        const relativeDepPath = path.resolve(dirname, dep)
        const sourceFile = await SourceFile.loadFromFilePath(relativeDepPath, suffixes)
        if (sourceFile !== undefined) {
          resolved.local.push({
            sourceFile: await this.resolveSourceFile(sourceFile),
            origin: 'relative-path',
          })
          continue
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
            const sourceFile = await SourceFile.loadFromFilePath(relativePath, suffixes)
            if (sourceFile !== undefined) {
              resolved.local.push({
                sourceFile: await this.resolveSourceFile(sourceFile),
                origin: 'tsconfig-resolved-path',
              })
              found = true
              break // We only need the first match that exists.
            }
          }
          if (found) {
            continue
          }
        }

        if (tsconfigJson.baseUrl !== undefined) {
          const relativePath = path.resolve(tsconfigJson.basePath, tsconfigJson.baseUrl, dep)
          const sourceFile = await SourceFile.loadFromFilePath(relativePath, suffixes)
          if (sourceFile !== undefined) {
            resolved.local.push({
              sourceFile: await this.resolveSourceFile(sourceFile),
              origin: 'tsconfig-baseurl-relative-path',
            })
            continue
          }
        }
      }

      if (packageJson !== undefined) {
        if (packageJson.supportsPackageRelativePaths()) {
          const relativePath = path.resolve(packageJson.basePath, dep)
          const sourceFile = await SourceFile.loadFromFilePath(relativePath, suffixes)
          if (sourceFile !== undefined) {
            resolved.local.push({
              sourceFile: await this.resolveSourceFile(sourceFile),
              origin: 'package-relative-path',
            })
            continue
          }
        }
      }

      resolved.external.push(dep)
    }

    return resolved
  }
}
