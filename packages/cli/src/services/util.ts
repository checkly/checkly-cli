import * as path from 'path'
import * as fs from 'fs/promises'
import { Service } from 'ts-node'
import * as gitRepoInfo from 'git-repo-info'

export interface GitInformation {
  commitId: string
  branchName?: string | null
  commitOwner?: string | null
  commitMessage?: string | null
}

// TODO: Remove this in favor of glob? It's unused.
export async function walkDirectory (
  directory: string,
  ignoreDirectories: Set<string>,
  callback: (filepath: string) => Promise<void>,
): Promise<void> {
  const files = await fs.readdir(directory)
  for (const file of files.sort()) {
    const filepath = path.join(directory, file)
    const stats = await fs.stat(filepath)
    if (stats.isDirectory() && !ignoreDirectories.has(file)) {
      await walkDirectory(filepath, ignoreDirectories, callback)
    } else {
      await callback(filepath)
    }
  }
}

export async function loadJsFile (filepath: string): Promise<any> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let exported = await import(filepath)
    if (exported instanceof Function) {
      exported = await exported()
    }
    return exported
  } catch (err: any) {
    throw new Error(`Error loading file ${filepath}\n${err.stack}`)
  }
}

export async function loadTsFile (filepath: string): Promise<any> {
  try {
    const tsCompiler = await getTsCompiler()
    tsCompiler.enabled(true)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let { default: exported } = await import(filepath)
    if (exported instanceof Function) {
      exported = await exported()
    }
    tsCompiler.enabled(false) // Re-disable the TS compiler
    return exported
  } catch (err: any) {
    throw new Error(`Error loading file ${filepath}\n${err.stack}`)
  }
}

// To avoid a dependency on typescript for users with no TS checks, we need to dynamically import ts-node
let tsCompiler: Service
async function getTsCompiler (): Promise<Service> {
  if (tsCompiler) return tsCompiler
  try {
    const tsNode = await import('ts-node')
    tsCompiler = tsNode.register({
      compilerOptions: {
        module: 'CommonJS',
      },
    })
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      throw new Error('Please install ts-node and typescript to use TypeScript configuration files')
    }
    throw err
  }
  return tsCompiler
}

export function pathToPosix (relPath: string): string {
  // Windows uses \ rather than / as a path separator.
  // It's important that logical ID's are consistent across platforms, though.
  // Otherwise, checks will be deleted and recreated when `npx checkly deploy` is run on different machines.
  return path.normalize(relPath).split(path.sep).join(path.posix.sep).replace(/^C:/, '')
}

export function splitConfigFilePath (configFile?: string): { configDirectory: string, configFilenames?: string[] } {
  if (configFile) {
    const cwd = path.resolve(path.dirname(configFile))
    return {
      configDirectory: cwd,
      configFilenames: [path.basename(configFile)],
    }
  }
  return {
    configDirectory: process.cwd(),
    configFilenames: undefined,
  }
}

export function getGitInformation (): GitInformation|null {
  const repositoryInfo = gitRepoInfo()

  if (!repositoryInfo.sha) {
    return null
  }

  return {
    commitId: repositoryInfo.sha,
    branchName: repositoryInfo.branch,
    commitOwner: repositoryInfo.committer,
    commitMessage: repositoryInfo.commitMessage,
  }
}
