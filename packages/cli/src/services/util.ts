import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import { execFileSync } from 'child_process'
import gitRepoInfo from 'git-repo-info'
import { parse } from 'dotenv'

import { glob } from 'glob'
import { ChecklyConfig, PlaywrightSlimmedProp } from './checkly-config-loader.js'
import JSON5 from 'json5'
import { existsSync } from 'fs'

export interface GitInformation {
  /** Absent when the repository has no commits yet but a repo URL is known. */
  commitId?: string
  repoUrl?: string | null
  branchName?: string | null
  commitOwner?: string | null
  commitMessage?: string | null
  github?: GitHubActionsInformation
}

export interface GitHubActionsInformation {
  reporting: true
  source?: string
  githubCheckName?: string
  pullRequestNumber?: string
  environmentUrl?: string
  repository?: string
  sha?: string
  runId?: string
  runAttempt?: string
  workflow?: string
  job?: string
  eventName?: string
  ref?: string
  headRef?: string
  baseRef?: string
  serverUrl?: string
}

export interface CiInformation {
  environment: string | null
}

function getGitHubRepositoryUrl (): string | undefined {
  const repository = process.env.CHECKLY_GITHUB_REPOSITORY
  if (!repository) {
    return undefined
  }

  const serverUrl = process.env.CHECKLY_GITHUB_SERVER_URL ?? 'https://github.com'
  return `${serverUrl.replace(/\/$/, '')}/${repository}`
}

/** The repository URL from GitHub Actions' built-in env vars. */
function getGitHubActionsRepositoryUrl (): string | undefined {
  const serverUrl = process.env.GITHUB_SERVER_URL
  const repository = process.env.GITHUB_REPOSITORY
  if (!serverUrl || !repository) {
    return undefined
  }
  return `${serverUrl.replace(/\/$/, '')}/${repository}`
}

/**
 * Turns a git remote URL into a credential-free web URL, e.g.
 * `git@github.com:acme/app.git` -> `https://github.com/acme/app`.
 * Returns `undefined` for remotes that have no web URL (local paths, file://).
 */
export function normalizeGitRemoteUrl (remote: string): string | undefined {
  const trimmed = remote.trim()
  if (!trimmed) {
    return undefined
  }

  let host: string
  let repoPath: string
  let protocol = 'https:'

  // scp-like syntax: [user@]host:path. A single-letter host is a Windows drive.
  const scpLike = trimmed.match(/^(?:[^@/\s]+@)?([^:/\s]{2,}):(?!\/\/)(.+)$/)
  if (scpLike) {
    host = scpLike[1]
    repoPath = scpLike[2]
  } else {
    let url: URL
    try {
      url = new URL(trimmed)
    } catch {
      return undefined
    }
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      // Keep the port: it is part of the web address. Credentials are dropped.
      protocol = url.protocol
      host = url.host
    } else if (url.protocol === 'ssh:' || url.protocol === 'git+ssh:' || url.protocol === 'git:') {
      // SSH and git-daemon ports don't carry over to the web URL.
      host = url.hostname
    } else {
      return undefined
    }
    repoPath = url.pathname
  }

  repoPath = repoPath
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
  if (!host || !repoPath) {
    return undefined
  }
  return `${protocol}//${host}/${repoPath}`
}

/**
 * The web URL of the `origin` remote of the git repository at `cwd`, with
 * credentials stripped. `undefined` when there is no repository, no origin,
 * or git is not installed.
 */
export function getRepoUrlFromGit (cwd: string = process.cwd()): string | undefined {
  let remote: string
  try {
    remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return undefined
  }
  return normalizeGitRemoteUrl(remote)
}

function isGitHubReportingEnabled (): boolean {
  const value = (process.env.CHECKLY_GITHUB_REPORT ?? '').trim().toLowerCase()
  return value === 'true' || value === '1'
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
    throw new Error(`Error parsing file path '${path}': ${err}`, { cause: err })
  }
  return result
}
/**
 * @param repoUrl default repoURL the user can set in their project config.
 * @param cwd directory to read git information from.
 */
export function getGitInformation (repoUrl?: string, cwd: string = process.cwd()): GitInformation | null {
  const repositoryInfo = gitRepoInfo(cwd)

  const commitId = process.env.CHECKLY_REPO_SHA
    ?? process.env.CHECKLY_TEST_REPO_SHA
    ?? process.env.CHECKLY_GITHUB_SHA
    ?? repositoryInfo.sha
    ?? undefined

  // Declared values first; the git remote is only a last resort. Callers must
  // not copy a derived URL into project.repoUrl: the backend only lets it fill
  // a project that has no URL yet.
  const resolvedRepoUrl = process.env.CHECKLY_REPO_URL
    ?? process.env.CHECKLY_TEST_REPO_URL
    ?? repoUrl
    ?? getGitHubRepositoryUrl()
    ?? getGitHubActionsRepositoryUrl()
    ?? getRepoUrlFromGit(cwd)

  // A repository without commits still has a URL worth sending.
  if (!commitId && !resolvedRepoUrl) {
    return null
  }

  // safe way to remove the email address
  const committer = (repositoryInfo.committer?.match(/([^<]+)/) || [])[1]?.trim()
  const gitInformation: GitInformation = {
    ...(commitId ? { commitId } : {}),
    repoUrl: resolvedRepoUrl,
    branchName: process.env.CHECKLY_REPO_BRANCH ?? process.env.CHECKLY_TEST_REPO_BRANCH ?? repositoryInfo.branch,
    commitOwner: process.env.CHECKLY_REPO_COMMIT_OWNER ?? process.env.CHECKLY_TEST_REPO_COMMIT_OWNER ?? committer,
    commitMessage: process.env.CHECKLY_REPO_COMMIT_MESSAGE
      ?? process.env.CHECKLY_TEST_REPO_COMMIT_MESSAGE
      ?? repositoryInfo.commitMessage,
  }

  if (isGitHubReportingEnabled()) {
    gitInformation.github = {
      reporting: true,
      source: process.env.CHECKLY_GITHUB_SOURCE,
      githubCheckName: process.env.CHECKLY_GITHUB_CHECK_NAME,
      pullRequestNumber: process.env.CHECKLY_GITHUB_PULL_REQUEST_NUMBER,
      environmentUrl: process.env.CHECKLY_GITHUB_ENVIRONMENT_URL,
      repository: process.env.CHECKLY_GITHUB_REPOSITORY,
      sha: process.env.CHECKLY_GITHUB_SHA,
      runId: process.env.CHECKLY_GITHUB_RUN_ID,
      runAttempt: process.env.CHECKLY_GITHUB_RUN_ATTEMPT,
      workflow: process.env.CHECKLY_GITHUB_WORKFLOW,
      job: process.env.CHECKLY_GITHUB_JOB,
      eventName: process.env.CHECKLY_GITHUB_EVENT_NAME,
      ref: process.env.CHECKLY_GITHUB_REF,
      headRef: process.env.CHECKLY_GITHUB_HEAD_REF,
      baseRef: process.env.CHECKLY_GITHUB_BASE_REF,
      serverUrl: process.env.CHECKLY_GITHUB_SERVER_URL,
    }
  }

  return gitInformation
}

/**
 * The absolute path of the git repository root the CLI runs in, or
 * `undefined` outside a repository. Kept separate from GitInformation, which
 * is sent to the API as `repoInfo` verbatim and must not carry local
 * filesystem paths.
 *
 * Walks up from `startDir` to the nearest `.git` entry rather than using
 * `git-repo-info`'s `root`: in a linked worktree that library reports the
 * main checkout, and files would then be attributed relative to the wrong
 * tree. A `.git` *file* (worktree or submodule) counts as a root just like
 * a `.git` directory does.
 */
export function getGitRepoRoot (startDir: string = process.cwd()): string | undefined {
  let current = path.resolve(startDir)
  for (;;) {
    if (fsSync.existsSync(path.join(current, '.git'))) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
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

export async function findFilesWithPattern (
  directory: string,
  pattern: string | string[],
  ignorePattern: string[],
): Promise<string[]> {
  // Not using pathToPosix here because it strips the drive letter (e.g. C:) that glob
  // needs to resolve absolute patterns on Windows.
  const posixPattern = Array.isArray(pattern)
    ? pattern.map(p => p.replaceAll('\\', '/'))
    : pattern.replaceAll('\\', '/')
  const files = await glob(posixPattern, {
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
