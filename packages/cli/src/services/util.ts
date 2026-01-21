import type { CreateAxiosDefaults } from 'axios'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import gitRepoInfo from 'git-repo-info'
import { parse } from 'dotenv'

// @ts-ignore
import { getProxyForUrl } from 'proxy-from-env'
import { httpOverHttp, httpsOverHttp, httpOverHttps, httpsOverHttps } from 'tunnel'
import type { Archiver } from 'archiver'
import { glob } from 'glob'
import os from 'node:os'
import { ChecklyConfig, PlaywrightSlimmedProp } from './checkly-config-loader'
import { Parser } from './check-parser/parser'
import * as JSON5 from 'json5'
import { PlaywrightConfig } from './playwright-config'
import { readFile } from 'fs/promises'
import { createHash } from 'crypto'
import { Session } from '../constructs'
import semver from 'semver'
import {
  detectNearestLockfile,
  NpmDetector,
  PNpmDetector,
  YarnDetector,
} from './check-parser/package-files/package-manager'
import { existsSync } from 'fs'

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
    throw new Error(`Error parsing file path '${path}': ${err}`)
  }
  return result
}
/**
 * @param repoUrl default repoURL the user can set in their project config.
 */
export function getGitInformation (repoUrl?: string): GitInformation | null {
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
    commitMessage: process.env.CHECKLY_REPO_COMMIT_MESSAGE
      ?? process.env.CHECKLY_TEST_REPO_COMMIT_MESSAGE
      ?? repositoryInfo.commitMessage,
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

export async function getEnvs (envFile: string | undefined, envArgs: Array<string>) {
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

export function normalizeVersion (v?: string | undefined): string | undefined {
  const cleaned =
    semver.valid(semver.clean(v ?? '') || '')
    ?? semver.coerce(v ?? '')?.version
  return cleaned && semver.valid(cleaned) ? cleaned : undefined
}

export async function bundlePlayWrightProject (
  playwrightConfig: string,
  include: string[],
): Promise<{
  outputFile: string
  browsers: string[]
  relativePlaywrightConfigPath: string
  cacheHash: string
  playwrightVersion: string
}> {
  const dir = path.resolve(path.dirname(playwrightConfig))
  const filePath = path.resolve(dir, playwrightConfig)
  const lockfile = Session.workspace.unwrap().lockfile.unwrap()

  // No need of loading everything if there is no lockfile
  const pwtConfig = await Session.loadFile(filePath)
  const outputFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-'))
  const outputFile = path.join(outputFolder, 'playwright-project.tar.gz')
  const output = fsSync.createWriteStream(outputFile)

  // Dynamic import for CommonJs so it doesn't break when using checkly/playwright-reporter archiver
  // The custom Checkly fork of archiver exports TarArchive class instead of a default function
  const archiverModule: any = await import('archiver')
  let archive: Archiver
  if (archiverModule.TarArchive) {
    // Using Checkly's custom fork which exports TarArchive class
    archive = new archiverModule.TarArchive({ gzip: true, gzipOptions: { level: 9 } })
  } else if (archiverModule.default) {
    // Using standard archiver which has a default factory function
    archive = archiverModule.default('tar', { gzip: true, gzipOptions: { level: 9 } })
  } else {
    throw new Error('Unable to initialize archiver: neither TarArchive nor default export found')
  }
  archive.pipe(output)

  const pwConfigParsed = new PlaywrightConfig(filePath, pwtConfig)

  const playwrightVersion = getPlaywrightVersionFromPackage(dir)

  const [cacheHash] = await Promise.all([
    getCacheHash(lockfile),
    loadPlaywrightProjectFiles(dir, pwConfigParsed, include, archive),
  ])

  await archive.finalize()
  return new Promise((resolve, reject) => {
    output.on('close', () => {
      return resolve({
        outputFile,
        browsers: pwConfigParsed.getBrowsers(),
        playwrightVersion,
        relativePlaywrightConfigPath: Session.contextRelativePosixPath(filePath),
        cacheHash,
      })
    })

    output.on('error', err => {
      return reject(err)
    })
  })
}

export async function getCacheHash (lockFile: string): Promise<string> {
  const fileBuffer = await readFile(lockFile)
  const hash = createHash('sha256')
  hash.update(fileBuffer)
  return hash.digest('hex')
}

export function getPlaywrightVersionFromPackage (cwd: string): string {
  try {
    const playwrightPath = require.resolve('@playwright/test/package.json', { paths: [cwd] })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const playwrightPkg = require(playwrightPath)
    const version = normalizeVersion(playwrightPkg.version)

    if (!version) {
      throw new Error('Invalid version found in @playwright/test package.json')
    }

    return version
  } catch (error) {
    // @ts-ignore
    if (error instanceof Error && error.code === 'MODULE_NOT_FOUND') {
      throw new Error('Could not find @playwright/test package. Make sure it is installed.')
    }
    throw error
  }
}

export async function loadPlaywrightProjectFiles (
  dir: string, pwConfigParsed: PlaywrightConfig, include: string[], archive: Archiver,
) {
  const ignoredFiles = ['**/node_modules/**', '.git/**', ...Session.ignoreDirectoriesMatch]
  const parser = new Parser({
    workspace: Session.workspace.ok(),
    restricted: false,
  })
  const { filePaths, fileEntries, errors } = await parser.getFilesAndDependencies(pwConfigParsed)
  if (errors.length) {
    throw new Error(`Error loading playwright project files: ${errors.map((e: string) => e).join(', ')}`)
  }
  const root = Session.basePath!
  const entryDefaults = {
    mode: 0o755, // Default mode for files in the archive
  }
  for (const { filePath, content } of fileEntries) {
    archive.append(content, {
      ...entryDefaults,
      name: Session.relativePosixPath(filePath),
    })
  }
  for (const filePath of filePaths) {
    archive.file(filePath, {
      ...entryDefaults,
      name: Session.relativePosixPath(filePath),
    })
  }
  for (const includePattern of include) {
    // If pattern explicitly targets an ignored directory, only apply custom ignores
    const explicitlyTargetsIgnored =
      includePattern.startsWith('node_modules/')
      || includePattern.startsWith('.git/')

    archive.glob(includePattern, {
      cwd: root,
      ignore: explicitlyTargetsIgnored ? Session.ignoreDirectoriesMatch : ignoredFiles,
    }, {
      ...entryDefaults,
    })
  }
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

export function cleanup (dir: string) {
  if (!dir.length) {
    return
  }
  return fs.rm(dir, { recursive: true, force: true })
}

export function getDefaultChecklyConfig (
  directoryName: string,
  playwrightConfigPath: string,
  playwrightCheck: PlaywrightSlimmedProp | null = null,
): ChecklyConfig {
  const check = playwrightCheck || {
    logicalId: directoryName,
    name: directoryName,
    frequency: 10,
    locations: ['us-east-1'],
  }
  return {
    logicalId: directoryName,
    projectName: directoryName,
    checks: {
      playwrightConfigPath,
      playwrightChecks: [check],
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

export function getPlaywrightConfigPath (
  playwrightCheckProps: PlaywrightSlimmedProp,
  playwrightConfigPath: string | undefined,
  dir: string,
): string {
  if (playwrightCheckProps.playwrightConfigPath) {
    return path.resolve(dir, playwrightCheckProps.playwrightConfigPath)
  } else if (playwrightConfigPath) {
    return path.resolve(dir, playwrightConfigPath)
  } else {
    throw new Error('No Playwright config path provided.')
  }
}

export function findPlaywrightConfigPath (dir: string): string | undefined {
  return ['playwright.config.ts', 'playwright.config.js']
    .map(file => path.resolve(dir, file))
    .find(filePath => existsSync(filePath))
}
