/* eslint-disable @typescript-eslint/no-require-imports */
import type { CreateAxiosDefaults } from 'axios'
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
import os from 'node:os'
import { ChecklyConfig } from './checkly-config-loader'
import { Parser } from './check-parser/parser'
import * as JSON5 from 'json5'
import { PlaywrightConfig } from './playwright-config'

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

export async function loadFile (filepath: string): Promise<any> {
  try {
    let exported: any
    if (/\.[mc]?ts$/.test(filepath)) {
      exported = await loadTsFileDefault(filepath)
    } else {
      exported = (await import(pathToPosix(filepath))).default
    }
    if (typeof exported === 'function') {
      exported = await exported()
    }
    return exported
  } catch (err: any) {
    throw new Error(`Error loading file ${filepath}\n${err.stack}`)
  }
}

async function loadTsFileDefault (filepath: string): Promise<any> {
  const jiti = await getJiti()
  if (jiti) {
    return jiti.import<any>(filepath, {
      default: true,
    })
  }

  // Backward-compatibility for users who installed ts-node.
  const tsCompiler = await getTsNodeService()
  if (tsCompiler) {
    tsCompiler.enabled(true)
    let exported: any
    try {
      exported = (await require(filepath)).default
    } catch (err: any) {
      if (err.message && err.message.includes('Unable to compile TypeScript')) {
        throw new Error(`Consider installing "jiti" instead of "ts-node" for improved TypeScript support\n${err.stack}`)
      }
      throw err
    } finally {
      tsCompiler.enabled(false) // Re-disable the TS compiler
    }
    return exported
  }

  throw new Error('Please install "jiti" to use TypeScript files')
}

// Regular type import gave issue with jest.
type Jiti = ReturnType<(typeof import('jiti', {
  with: {
    'resolution-mode': 'import'
  }
}))['createJiti']>

// To avoid a dependency on typescript for users with no TS checks, we need to dynamically import jiti
let jiti: Jiti
let haveJiti = false
async function getJiti (): Promise<Jiti | undefined> {
  if (haveJiti) return jiti
  try {
    const maybeJiti = await import('jiti')
    // Jiti 1x does not have createJiti().
    if (typeof maybeJiti.createJiti !== 'function') {
      return
    }
    jiti = maybeJiti.createJiti(__filename)
    haveJiti = true
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      return undefined
    }
    throw err
  }
  return jiti
}

// To avoid a dependency on typescript for users with no TS checks, we need to dynamically import ts-node
let tsNodeService: Service
async function getTsNodeService (): Promise<Service | undefined> {
  if (tsNodeService) return tsNodeService
  try {
    const tsNode = await import('ts-node')
    tsNodeService = tsNode.register({
      moduleTypes: {
        '**/*': 'cjs',
      },
      compilerOptions: {
        module: 'CommonJS',
      },
    })
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      return undefined
    }
    throw err
  }
  return tsNodeService
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

export async function bundlePlayWrightProject (playwrightConfig: string, include: string[]):
Promise<{outputFile: string, browsers: string[], relativePlaywrightConfigPath: string}> {
  const dir = path.resolve(path.dirname(playwrightConfig))
  const filePath = path.resolve(dir, playwrightConfig)
  const pwtConfig = await loadFile(filePath)
  const outputFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-'))
  const outputFile = path.join(outputFolder, 'playwright-project.tar.gz')
  const output = fsSync.createWriteStream(outputFile)

  const archive = create('tar', {
    gzip: true,
    gzipOptions: {
      level: 9,
    },
  })
  archive.pipe(output)

  const pwConfigParsed = new PlaywrightConfig(dir, pwtConfig)

  await loadPlaywrightProjectFiles(dir, pwConfigParsed, include, archive)
  archive.file(playwrightConfig, { name: path.basename(playwrightConfig) })
  await archive.finalize()
  return new Promise((resolve, reject) => {
    output.on('close', () => {
      return resolve({ outputFile, browsers: pwConfigParsed.getBrowsers(), relativePlaywrightConfigPath: path.relative(dir, filePath) })
    })

    output.on('error', (err) => {
      return reject(err)
    })
  })
}

export async function loadPlaywrightProjectFiles (
  dir: string, pwConfigParsed: PlaywrightConfig, include: string[], archive: Archiver,
) {
  const ignoredFiles = ['**/node_modules/**', '.git/**']
  const parser = new Parser({})
  const { files } = await parser.getFilesAndDependencies(pwConfigParsed)
  for (const file of files) {
    const relativePath = path.relative(dir, file)
    archive.file(file, { name: relativePath })
  }
  // TODO: This code below should be a single glob
  archive.glob('**/package*.json', { cwd: path.join(dir, '/'), ignore: ignoredFiles })
  archive.glob('**/pnpm*.yaml', { cwd: path.join(dir, '/'), ignore: ignoredFiles })
  archive.glob('**/yarn.lock', { cwd: path.join(dir, '/'), ignore: ignoredFiles })
  for (const includePattern of include) {
    archive.glob(includePattern, { cwd: path.join(dir, '/'), ignore: ignoredFiles })
  }
}

export async function findRegexFiles (directory: string, regex: RegExp, ignorePattern: string[]):
  Promise<string[]> {
  const files = await findFilesWithPattern(directory, '**/*.{js,ts,mjs}', ignorePattern)
  return files.filter(file => regex.test(file)).map(file => pathToPosix(path.relative(directory, file)))
}

export async function findFilesWithPattern (
  directory: string,
  pattern: string | string[],
  ignorePattern: string[]
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

export function cleanup (dir: string) {
  if (!dir.length) {
    return
  }
  return fs.rm(dir)
}

export function getDefaultChecklyConfig (directoryName: string, playwrightConfigPath: string): ChecklyConfig {
  return {
    logicalId: directoryName,
    projectName: directoryName,
    checks: {
      playwrightConfigPath,
      playwrightChecks: [
        {
          name: directoryName,
          frequency: 10,
          locations: ['us-east-1'],
        },
      ],
      frequency: 10,
      locations: ['us-east-1'],
    },
    cli: {
      runLocation: 'us-east-1',
    },
  }
}

export async function writeChecklyConfigFile (dir: string, config: ChecklyConfig) {
  const configFile = path.join(dir, 'checkly.config.ts')
  const configContent =
    `import { defineConfig } from 'checkly'\n\nconst config = defineConfig(${JSON5.stringify(config, null, 2)})\n\nexport default config`

  await fs.writeFile(configFile, configContent, { encoding: 'utf-8' })
}
