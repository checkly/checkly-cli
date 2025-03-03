import type { AxiosResponse, CreateAxiosDefaults } from 'axios'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import { Service } from 'ts-node'
import gitRepoInfo from 'git-repo-info'
import { parse } from 'dotenv'
// @ts-ignore
import { getProxyForUrl } from 'proxy-from-env'
import { httpOverHttp, httpsOverHttp, httpOverHttps, httpsOverHttps } from 'tunnel'
import { Archiver, create } from 'archiver'
import { glob } from 'glob'
import { Parser } from './check-parser/parser'
import { checklyStorage } from '../rest/api'
import { loadFile } from './checkly-config-loader'

// Copied from oclif/core
// eslint-disable-next-line
const _importDynamic = new Function('modulePath', 'return import(modulePath)')

export interface GitInformation {
  commitId: string
  repoUrl?: string | null
  branchName?: string | null
  commitOwner?: string | null
  commitMessage?: string | null
}

export interface CiInformation {
  environment: string | null
}

export function findFilesRecursively (directory: string, ignoredPaths: Array<string> = []) {
  if (!fsSync.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
    return []
  }

  const files = []
  const directoriesToVisit = [directory]
  const ignoredPathsSet = new Set(ignoredPaths)
  while (directoriesToVisit.length > 0) {
    const currentDirectory = directoriesToVisit.shift()!
    const contents = fsSync.readdirSync(currentDirectory, { withFileTypes: true })
    for (const content of contents) {
      if (content.isSymbolicLink()) {
        continue
      }
      const fullPath = path.resolve(currentDirectory, content.name)
      if (ignoredPathsSet.has(fullPath)) {
        continue
      }
      if (content.isDirectory()) {
        directoriesToVisit.push(fullPath)
      } else {
        files.push(fullPath)
      }
    }
  }
  return files
}

export async function loadJsFile (filepath: string): Promise<any> {
  try {
    // There is a Node opened issue related with a segmentation fault using ES6 modules
    // with jest https://github.com/nodejs/node/issues/35889
    // As a work around, we check if Jest is running to modify the way to import the module.
    // TODO: investigate if the issue is fixed to clean up the conditional import
    let { default: exported } = typeof jest !== 'undefined'
      ? { default: await require(filepath) }
      : await _importDynamic(pathToPosix(filepath))

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
    let { default: exported } = await require(filepath)
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
      moduleTypes: {
        '**/*': 'cjs',
      },
      compilerOptions: {
        module: 'CommonJS',
      },
    })
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      throw new Error('Please install "ts-node" and "typescript" to use TypeScript configuration files')
    }
    throw err
  }
  return tsCompiler
}

/**
 * @param relPath the path to be converted
 * @param separator this is for testing purposes only so we can reliably replace the separator on Linux / Darwin
 */
export function pathToPosix (relPath: string, separator?: string): string {
  // Windows uses \ rather than / as a path separator.
  // It's important that logical ID's are consistent across platforms, though.
  // Otherwise, checks will be deleted and recreated when `npx checkly deploy` is run on different machines.
  return path.normalize(relPath).split(separator ?? path.sep).join(path.posix.sep).replace(/^[C|D]:/i, '')
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

export function isFileSync (path: string): boolean {
  // This helper is useful to test paths inside constructors which cannot be async.
  let result
  try {
    result = fsSync.existsSync(path)
  } catch (err: any) {
    throw new Error(`Error parsing the file path: ${path}`)
  }
  return result
}
/**
 * @param repoUrl default repoURL the user can set in their project config.
 */
export function getGitInformation (repoUrl?: string): GitInformation|null {
  const repositoryInfo = gitRepoInfo()

  if (!process.env.CHECKLY_REPO_SHA && !process.env.CHECKLY_TEST_REPO_SHA && !repositoryInfo.sha) {
    return null
  }

  // safe way to remove the email address
  const committer = (repositoryInfo.committer?.match(/([^<]+)/) || [])[1]?.trim()
  return {
    commitId: process.env.CHECKLY_REPO_SHA ?? process.env.CHECKLY_TEST_REPO_SHA ?? repositoryInfo.sha,
    repoUrl: process.env.CHECKLY_REPO_URL ?? process.env.CHECKLY_TEST_REPO_URL ?? repoUrl,
    branchName: process.env.CHECKLY_REPO_BRANCH ?? process.env.CHECKLY_TEST_REPO_BRANCH ?? repositoryInfo.branch,
    commitOwner: process.env.CHECKLY_REPO_COMMIT_OWNER ?? process.env.CHECKLY_TEST_REPO_COMMIT_OWNER ?? committer,
    commitMessage: process.env.CHECKLY_REPO_COMMIT_MESSAGE ??
      process.env.CHECKLY_TEST_REPO_COMMIT_MESSAGE ??
      repositoryInfo.commitMessage,
  }
}

export function getCiInformation (): CiInformation {
  return {
    environment: process.env.CHECKLY_TEST_ENVIRONMENT ?? null,
  }
}

export function escapeValue (value: string | undefined) {
  return value
    ? value
      .replace(/\n/g, '\\n') // combine newlines (unix) into one line
      .replace(/\r/g, '\\r') // combine newlines (windows) into one line
    : ''
}

export async function getEnvs (envFile: string|undefined, envArgs: Array<string>) {
  if (envFile) {
    const envsString = await fs.readFile(envFile, { encoding: 'utf8' })
    return parse(envsString)
  }
  const envsString = `${envArgs.join('\n')}`
  return parse(envsString)
}

const isHttps = (protocol: string) => protocol.startsWith('https')

export function assignProxy (baseURL: string, axiosConfig: CreateAxiosDefaults) {
  const proxyUrlEnv = getProxyForUrl(baseURL)
  if (!proxyUrlEnv) {
    return axiosConfig
  }

  const parsedProxyUrl = new URL(proxyUrlEnv)
  const isProxyHttps = isHttps(parsedProxyUrl.protocol)
  const isEndpointHttps = isHttps(baseURL)
  const proxy: any = {
    host: parsedProxyUrl.hostname,
    port: parsedProxyUrl.port,
    protocol: parsedProxyUrl.protocol,
  }
  if (parsedProxyUrl.username && parsedProxyUrl.password) {
    proxy.proxyAuth = `${parsedProxyUrl.username}:${parsedProxyUrl.password}`
  }
  if (isProxyHttps && isEndpointHttps) {
    axiosConfig.httpsAgent = httpsOverHttps({ proxy })
  } else if (isProxyHttps && !isEndpointHttps) {
    axiosConfig.httpAgent = httpOverHttps({ proxy })
  } else if (!isProxyHttps && isEndpointHttps) {
    axiosConfig.httpsAgent = httpsOverHttp({ proxy })
  } else {
    axiosConfig.httpAgent = httpOverHttp({ proxy })
  }
  axiosConfig.proxy = false
  return axiosConfig
}

export async function bundlePlayWrightProject (playwrightConfig: string): Promise<string> {
  const dir = path.resolve(path.dirname(playwrightConfig))
  const filePath = path.resolve(dir, playwrightConfig)
  const pwtFileName = path.basename(filePath)
  const pwtConfig = await loadFile(filePath)
  const outputDir = path.join(dir, 'playwright-project.tar.gz')
  const output = fsSync.createWriteStream(outputDir)

  const archive = create('tar', {
    gzip: true,
    gzipOptions: {
      level: 9,
    },
  })
  archive.pipe(output)
  archive.append(fsSync.createReadStream(filePath), { name: pwtFileName })
  const { packageJson, packageLock } = getPackageJsonFiles(dir)
  archive.append(fsSync.createReadStream(packageJson), { name: 'package.json' })
  archive.append(fsSync.createReadStream(packageLock), { name: 'package-lock.json' })
  const files = await loadPlaywrightProjectFiles(dir, pwtConfig, archive)
  loadFilesDependencies(dir, files, archive)
  await archive.finalize()
  return new Promise((resolve, reject) => {
    output.on('close', () => {
      return resolve(outputDir)
    })

    output.on('error', (err) => {
      return reject(err)
    })
  })
}

export function getPackageJsonFiles (dir: string) {
  const packageJson = path.resolve(dir, 'package.json')
  const packageLock = path.resolve(dir, 'package-lock.json')
  return { packageJson, packageLock }
}

export async function loadPlaywrightProjectFiles (dir: string, playWrightConfig: any, archive: Archiver) {
  const files: string[] = []
  if (playWrightConfig.testDir) {
    archive.directory(path.resolve(dir, playWrightConfig.testDir), path.basename(playWrightConfig.testDir))
    files.push(...getFiles(path.resolve(dir, playWrightConfig.testDir)))
  }
  if (playWrightConfig.testMatch) {
    if (Array.isArray(playWrightConfig.testMatch)) {
      const arr = await Promise
        .all(playWrightConfig.testMatch
          .map((pattern: string) => loadPatternWithDependencies(pattern, dir, archive)))
      files.push(...arr.flatMap(x => x))
    } else {
      const arr = await loadPatternWithDependencies(playWrightConfig.testMatch, dir, archive)
      files.push(...arr)
    }
  }
  for (const project of playWrightConfig.projects) {
    if (project.testDir) {
      archive.directory(path.resolve(dir, project.testDir), project.testDir)
      files.push(...getFiles(path.resolve(dir, project.testDir)))
    }
    if (project.testMatch) {
      if (Array.isArray(project.testMatch)) {
        const arr = await Promise
          .all(project.testMatch
            .map((pattern: string) => loadPatternWithDependencies(pattern, dir, archive)))
        files.push(...arr.flatMap(x => x))
      } else {
        const arr = await loadPatternWithDependencies(project.testMatch, dir, archive)
        files.push(...arr)
      }
    }
  }
  return files
}

function loadPatternWithDependencies (pattern: string, dir: string, archive: Archiver) {
  archive.glob(pattern, { cwd: dir })
  return findFilesWithPattern(dir, pattern, [])
}

export function loadFilesDependencies (dir: string, files: string[], archive: Archiver) {
  const parser = new Parser({
    checkUnsupportedModules: false,
  })
  const dependencyFiles = files
    .map(file => parser.parse(file))
    .flatMap(({ dependencies }) => dependencies)
    .map(({ filePath }) => filePath)
  new Set(dependencyFiles)
    .forEach(dep => {
      const relPath = dep.replace(dir, '')
      archive.append(fsSync.createReadStream(dep), { name: relPath })
    })
}

export async function findFilesWithPattern (
  directory: string,
  pattern: string | string[],
  ignorePattern: string[],
): Promise<string[]> {
  // The files are sorted to make sure that the processing order is deterministic.
  const files = await glob(pattern, {
    nodir: true,
    cwd: directory,
    ignore: ignorePattern,
    absolute: true,
  })
  return files.sort()
}

export function uploadPlaywrightProject (dir: string): Promise<AxiosResponse> {
  const { size } = fsSync.statSync(dir)
  const stream = fsSync.createReadStream(dir)
  return checklyStorage.uploadCodeBundle(stream, size)
}

export function cleanup (dir: string) {
  if (!dir.length) {
    return
  }
  fsSync.rmSync(dir)
}

function getFiles (dir: string, files: string[] = []) {
  const fileList = fsSync.readdirSync(dir)
  for (const file of fileList) {
    const name = path.join(dir, file)
    if (fsSync.statSync(name).isDirectory()) {
      getFiles(name, files)
    } else {
      files.push(name)
    }
  }
  return files
}
