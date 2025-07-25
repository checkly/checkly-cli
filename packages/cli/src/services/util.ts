import type { CreateAxiosDefaults } from 'axios'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import gitRepoInfo from 'git-repo-info'
import { parse } from 'dotenv'

// @ts-ignore
import { getProxyForUrl } from 'proxy-from-env'
import { httpOverHttp, httpsOverHttp, httpOverHttps, httpsOverHttps } from 'tunnel'
import archiver from 'archiver'
import type { Archiver } from 'archiver'
import { glob } from 'glob'
import os from 'node:os'
import { ChecklyConfig, PlaywrightSlimmedProp } from './checkly-config-loader'
import { Parser } from './check-parser/parser'
import * as JSON5 from 'json5'
import { PlaywrightConfig } from './playwright-config'
import { access , readFile} from 'fs/promises'
import { createHash } from 'crypto';
import { Session } from '../constructs'
import semver from 'semver'

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

export function normalizeVersion(v?: string | undefined): string | undefined {
  const cleaned =
    semver.valid(semver.clean(v ?? '') || '') ??
    semver.coerce(v ?? '')?.version;
  return cleaned && semver.valid(cleaned) ? cleaned : undefined;
}

export async function bundlePlayWrightProject (playwrightConfig: string, include: string[]):
Promise<{outputFile: string, browsers: string[], relativePlaywrightConfigPath: string, cacheHash: string, playwrightVersion: string | undefined}> {
  const dir = path.resolve(path.dirname(playwrightConfig))
  const filePath = path.resolve(dir, playwrightConfig)
  const pwtConfig = await Session.loadFile(filePath)
  const outputFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-'))
  const outputFile = path.join(outputFolder, 'playwright-project.tar.gz')
  const output = fsSync.createWriteStream(outputFile)

  const archive = archiver('tar', {
    gzip: true,
    gzipOptions: {
      level: 9,
    },
  })
  archive.pipe(output)

  const pwConfigParsed = new PlaywrightConfig(filePath, pwtConfig)
  const lockFile = await findLockFile(dir)
  if (!lockFile) {
    throw new Error('No lock file found')
  }

  const [cacheHash, playwrightVersion] = await Promise.all([
    getCacheHash(lockFile),
    getPlaywrightVersion(dir),
    loadPlaywrightProjectFiles(dir, pwConfigParsed, include, archive)
  ])

  await archive.finalize()
  return new Promise((resolve, reject) => {
    output.on('close', () => {
      return resolve({
        outputFile,
        browsers: pwConfigParsed.getBrowsers(),
        playwrightVersion,
        relativePlaywrightConfigPath: path.relative(dir, filePath),
        cacheHash
      })
    })

    output.on('error', (err) => {
      return reject(err)
    })
  })
}

export async function getCacheHash (lockFile: string): Promise<string> {
  const fileBuffer = await readFile(lockFile);
  const hash = createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

export async function getPlaywrightVersion(projectDir: string): Promise<string | undefined> {
  try {
    const modulePath = path.join(projectDir, 'node_modules', '@playwright', 'test', 'package.json');
    const packageJson = JSON.parse(await readFile(modulePath, 'utf-8'));
    return normalizeVersion(packageJson.version);
  } catch {
    // If node_modules not found, fall back to checking the project's package.json
    const packageJsonPath = path.join(projectDir, 'package.json');
    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
      const version = packageJson.dependencies?.['@playwright/test'] ||
                      packageJson.devDependencies?.['@playwright/test'];
      return normalizeVersion(version);
    } catch {
      return;
    }
  }
}

async function findLockFile(dir: string): Promise<string | null> {
  const lockFiles = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"];

  for (const lockFile of lockFiles) {
    const filePath = path.join(dir, lockFile);
    try {
      await access(filePath);
      return filePath;
    } catch {
      // Ignore errors, just check the next file
    }
  }
  return null; // Return null if no lock file is found
}

export async function loadPlaywrightProjectFiles (
  dir: string, pwConfigParsed: PlaywrightConfig, include: string[], archive: Archiver,
) {
  const ignoredFiles = ['**/node_modules/**', '.git/**']
  const parser = new Parser({})
  const { files, errors } = await parser.getFilesAndDependencies(pwConfigParsed)
  const mode = 0o755 // Default mode for files in the archive
  if (errors.length) {
      throw new Error(`Error loading playwright project files: ${errors.map((e: string) => e).join(', ')}`)
  }
  for (const file of files) {
    const relativePath = path.relative(dir, file)
    archive.file(file, { name: relativePath, mode })
  }
  // TODO: This code below should be a single glob
  archive.glob('**/package*.json', { cwd: path.join(dir, '/'), ignore: ignoredFiles }, { mode })
  archive.glob('**/pnpm*.yaml', { cwd: path.join(dir, '/'), ignore: ignoredFiles }, { mode })
  archive.glob('**/yarn.lock', { cwd: path.join(dir, '/'), ignore: ignoredFiles }, { mode })
  for (const includePattern of include) {
    archive.glob(includePattern, { cwd: path.join(dir, '/') },  { mode })
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
  return fs.rm(dir, { recursive: true, force: true })
}

export function getDefaultChecklyConfig (directoryName: string, playwrightConfigPath: string, playwrightCheck: PlaywrightSlimmedProp | null = null): ChecklyConfig {
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
