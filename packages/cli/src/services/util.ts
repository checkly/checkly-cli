import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import gitRepoInfo from 'git-repo-info'
import { parse } from 'dotenv'

import { glob } from 'glob'
import { ChecklyConfig, PlaywrightSlimmedProp } from './checkly-config-loader'
import { File } from './check-parser/parser'
import * as JSON5 from 'json5'
import { PlaywrightConfig } from './playwright-config'
import { Session } from '../constructs/project'
import semver from 'semver'
import { existsSync } from 'fs'
import { detectNearestPackageJson, PackageManager } from './check-parser/package-files/package-manager'

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

export function normalizeVersion (v?: string | undefined): string | undefined {
  const cleaned =
    semver.valid(semver.clean(v ?? '') || '')
    ?? semver.coerce(v ?? '')?.version
  return cleaned && semver.valid(cleaned) ? cleaned : undefined
}

export function getAutoIncludes (
  packageManager: PackageManager,
  existingIncludes: string[],
): string[] {
  const autoIncludes: string[] = []

  if (packageManager.name === 'pnpm') {
    const patchesPattern = 'patches/*.patch'
    const alreadyIncluded = existingIncludes.some(p => p === patchesPattern || p.startsWith('patches/'))
    if (!alreadyIncluded) {
      autoIncludes.push(patchesPattern)
    }
  }

  return autoIncludes
}

export async function bundlePlayWrightProject (
  playwrightConfig: string,
  include: string[],
): Promise<{
  browsers: string[]
  relativePlaywrightConfigPath: string
  playwrightVersion: string
  workingDir?: string
  files: File[]
}> {
  const dir = path.resolve(path.dirname(playwrightConfig))
  const filePath = path.resolve(dir, playwrightConfig)

  // No need of loading everything if there is no lockfile
  const pwtConfig = await Session.loadFile(filePath)

  const pwConfigParsed = new PlaywrightConfig(filePath, pwtConfig)

  const playwrightVersion = await getPlaywrightVersionFromPackage(dir)

  const parser = Session.getPlaywrightParser()
  const { files, errors } = await parser.getFilesAndDependencies(pwConfigParsed)
  if (errors.length) {
    throw new Error(`Error loading playwright project files: ${errors.map((e: string) => e).join(', ')}`)
  }

  const defaultIgnores = [
    {
      pattern: '**/node_modules/**',
      skipIf: () => {
        return include.some(value => {
          return value.startsWith('node_modules/')
        })
      },
    },
    {
      pattern: '.git/**',
      skipIf: () => {
        return include.some(value => {
          return value.startsWith('.git/')
        })
      },
    },
  ]

  const ignoredFiles = [...Session.ignoreDirectoriesMatch]
  for (const ignore of defaultIgnores) {
    if (!ignore.skipIf()) {
      ignoredFiles.push(ignore.pattern)
    }
  }

  const autoIncludes = getAutoIncludes(Session.packageManager, include)
  const effectiveIncludes = [...include, ...autoIncludes]

  const includedFiles = await findFilesWithPattern(
    // FIXME: Shouldn't the pattern be relative to the Playwright check?
    Session.basePath!,
    effectiveIncludes,
    ignoredFiles,
  )

  for (const filePath of includedFiles) {
    files.push({
      filePath,
      physical: true,
    })
  }

  return {
    browsers: pwConfigParsed.getBrowsers(),
    playwrightVersion,
    relativePlaywrightConfigPath: Session.contextRelativePosixPath(filePath),
    workingDir: Session.relativePosixPath(Session.contextPath!),
    files,
  }
}

export async function getPlaywrightVersionFromPackage (cwd: string): Promise<string> {
  try {
    const playwrightPath = require.resolve('@playwright/test/package.json', { paths: [cwd] })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const playwrightPkg = require(playwrightPath)
    const version = normalizeVersion(playwrightPkg.version)

    if (!version) {
      throw new Error('Invalid version found in @playwright/test package.json')
    }

    const packageJson = await detectNearestPackageJson(cwd)
    const range =
      packageJson.dependencies?.['@playwright/test']
      ?? packageJson.devDependencies?.['@playwright/test']

    if (!range) {
      return version
    }

    const validRange = semver.validRange(range)
    if (validRange && !semver.satisfies(version, validRange)) {
      throw new Error(
        `Installed @playwright/test version ${version} does not satisfy the required range "${range}" in package.json. `
        + 'Please run your package manager\'s install command to sync node_modules.',
      )
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
  return ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mts', 'playwright.config.mjs']
    .map(file => path.resolve(dir, file))
    .find(filePath => existsSync(filePath))
}
