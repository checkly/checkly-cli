import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import Debug from 'debug'

const debug = Debug('checkly:cli:services:embedded-packages')

export const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org/'

/**
 * A configuration file to merge, and how hard to insist on reading it.
 * `optional` files are skipped with a log line when they exist but cannot
 * be read, for files the user did not choose to put there themselves.
 */
export interface NpmrcFile {
  path: string
  optional?: boolean
}

/**
 * Merged `.npmrc` configuration: a flat key → raw value map. Values keep
 * any `${VAR}` references unexpanded until they're actually used, so an
 * unset environment variable in an unrelated line never breaks anything.
 */
export type NpmrcConfig = Map<string, string>

export class NpmrcEnvVarError extends Error {
  constructor (key: string, varName: string) {
    super(
      `The .npmrc value for '${key}' references the environment variable`
      + ` '${varName}', which is not set`,
    )
    this.name = 'NpmrcEnvVarError'
  }
}

/**
 * Parses a single `.npmrc` file's content. Only the simple `key=value`
 * subset of npm's ini format is supported (comments with `#`/`;`,
 * whitespace trimming); ini sections do not occur in npm configs.
 */
export function parseNpmrc (content: string): NpmrcConfig {
  const config: NpmrcConfig = new Map()

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#') || line.startsWith(';')) {
      continue
    }
    const separator = line.indexOf('=')
    if (separator === -1) {
      continue
    }
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    // npm's ini parser strips matching quotes around values.
    if (value.length >= 2 && (value[0] === '"' || value[0] === '\'') && value.endsWith(value[0])) {
      value = value.slice(1, -1)
    }
    if (key !== '') {
      config.set(key, value)
    }
  }

  return config
}

/**
 * Extracts npm configuration from `npm_config_*` environment variables
 * (e.g. `npm_config_registry`, commonly set in CI and by package managers
 * running lifecycle scripts). In npm's precedence order these sit above
 * every `.npmrc` file. The prefix is matched case-insensitively; the key
 * is stored both verbatim and lowercased, because plain keys are written
 * in any case (`NPM_CONFIG_REGISTRY`) while nerf-darted auth keys carry a
 * case-sensitive spelling (`npm_config_//host/:_authToken`).
 */
export function npmrcConfigFromEnv (env: NodeJS.ProcessEnv): NpmrcConfig {
  const config: NpmrcConfig = new Map()

  const prefix = 'npm_config_'
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || !name.toLowerCase().startsWith(prefix)) {
      continue
    }
    const key = name.slice(prefix.length)
    // npm drops env config entries with empty values rather than treating
    // them as set-to-empty.
    if (key === '' || value === '') {
      continue
    }
    config.set(key, value)
    if (!config.has(key.toLowerCase())) {
      config.set(key.toLowerCase(), value)
    }
  }

  return config
}

/**
 * Loads and merges npm configuration in precedence order: `npm_config_*`
 * environment variables first, then `.npmrc` files with entries from
 * earlier paths winning over later ones (pass project first, then user).
 * Missing files are skipped.
 */
export async function loadNpmrcConfig (
  files: NpmrcFile[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<NpmrcConfig> {
  const merged: NpmrcConfig = npmrcConfigFromEnv(env)

  for (const { path: filePath, optional = false } of files) {
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (err: any) {
      if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR' || err?.code === 'EISDIR') {
        continue
      }
      // An unreadable .npmrc (e.g. bad permissions) must not silently drop
      // registry credentials — that would surface later as a baffling 401.
      // Optional files belong to another tool rather than to this project,
      // so an unreadable one must not take the whole command down with it.
      if (!optional) {
        throw new Error(`Unable to read npm configuration from '${filePath}'`, { cause: err })
      }
      debug('skipping unreadable optional config %s: %s', filePath, (err as Error).message)
      continue
    }
    for (const [key, value] of parseNpmrc(content)) {
      if (!merged.has(key)) {
        merged.set(key, value)
      }
    }
  }

  return merged
}

/**
 * The file pnpm keeps its global registry credentials in. pnpm 11 stopped
 * writing them to `.npmrc`: `pnpm login` writes `auth.ini` in pnpm's global
 * config directory instead, so a logged-in pnpm user looks unauthenticated
 * to anything that only reads `.npmrc`.
 *
 * The directory resolution mirrors pnpm's own `getConfigDir` branch for
 * branch. Note that `PNPM_HOME` is deliberately NOT consulted: pnpm uses it
 * for the data and state directories, never for the config directory.
 */
export function pnpmAuthIniPath (
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homedir: string,
): string {
  const xdgConfigHome = env.XDG_CONFIG_HOME
  if (xdgConfigHome !== undefined && xdgConfigHome !== '') {
    return path.join(xdgConfigHome, 'pnpm', 'auth.ini')
  }
  switch (platform) {
    case 'darwin':
      return path.join(homedir, 'Library', 'Preferences', 'pnpm', 'auth.ini')
    case 'win32': {
      const localAppData = env.LOCALAPPDATA
      if (localAppData !== undefined && localAppData !== '') {
        return path.join(localAppData, 'pnpm', 'config', 'auth.ini')
      }
      return path.join(homedir, '.config', 'pnpm', 'auth.ini')
    }
    default:
      return path.join(homedir, '.config', 'pnpm', 'auth.ini')
  }
}

export interface NpmrcPathsOptions {
  /** Workspace root, whose `.npmrc` is consulted. */
  workspaceRoot: string
  /**
   * The directory the Checkly project lives in (a workspace member in a
   * monorepo), whose `.npmrc` takes precedence over the workspace root's.
   */
  contextDir?: string
  homedir?: string
  /** pnpm's global `auth.ini`. Consulted whenever it is provided. */
  pnpmAuthFile?: string
  /**
   * True when the project's lockfile is pnpm's, which is when `auth.ini`
   * outranks the user `.npmrc` — matching pnpm's own precedence. For any
   * other package manager it ranks below.
   *
   * Note that precedence applies per key, as it does in npm and pnpm, not
   * per registry: a lower-ranked file's `_authToken` still wins over a
   * higher-ranked file's `username`/`_password` for the same registry,
   * because the credential kinds are distinct keys and `resolveAuthHeader`
   * prefers a token over basic auth. npm's own config cascade behaves the
   * same way.
   */
  pnpmAuthFilePreferred?: boolean
}

/**
 * The configuration files relevant to a project, highest precedence first:
 * the directory the Checkly project lives in (the nearest project config,
 * which may be a workspace member), the workspace root, then pnpm's global
 * `auth.ini` and the user-level `.npmrc` in whichever order the project's
 * package manager implies. (npm's global and builtin configs are not
 * consulted.)
 */
export function defaultNpmrcPaths (options: NpmrcPathsOptions): NpmrcFile[] {
  const { workspaceRoot, contextDir, homedir = os.homedir(), pnpmAuthFile, pnpmAuthFilePreferred } = options

  const userNpmrc: NpmrcFile = { path: path.join(homedir, '.npmrc') }
  // Not a file this project chose to have, so an unreadable one is skipped
  // rather than failing the command.
  const authIni: NpmrcFile[] = pnpmAuthFile !== undefined
    ? [{ path: pnpmAuthFile, optional: true }]
    : []

  const files: NpmrcFile[] = [
    ...(contextDir !== undefined ? [{ path: path.join(contextDir, '.npmrc') }] : []),
    { path: path.join(workspaceRoot, '.npmrc') },
    ...(pnpmAuthFilePreferred === true ? [...authIni, userNpmrc] : [userNpmrc, ...authIni]),
  ]

  // Dedupe by path, keeping the highest-precedence occurrence: `new Set` on
  // the records themselves would compare by identity and never match.
  return files.filter((file, index) => files.findIndex(other => other.path === file.path) === index)
}

function expandValue (key: string, value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
    const envValue = env[varName]
    if (envValue === undefined) {
      throw new NpmrcEnvVarError(key, varName)
    }
    return envValue
  })
}

function getExpanded (config: NpmrcConfig, key: string, env: NodeJS.ProcessEnv): string | undefined {
  const value = config.get(key) ?? config.get(key.toLowerCase())
  if (value === undefined) {
    return undefined
  }
  return expandValue(key, value, env)
}

/**
 * Resolves the registry URL for a package name: the `@scope:registry` entry
 * if the package is scoped and one exists, the `registry` entry otherwise,
 * falling back to the public npm registry. Always ends with a slash.
 */
export function resolveRegistryUrl (
  config: NpmrcConfig,
  packageName: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let registry: string | undefined

  if (packageName.startsWith('@')) {
    const scope = packageName.slice(0, packageName.indexOf('/'))
    registry = getExpanded(config, `${scope}:registry`, env)
  }

  registry ??= getExpanded(config, 'registry', env)
  registry ??= DEFAULT_REGISTRY_URL

  return registry.endsWith('/') ? registry : `${registry}/`
}

/**
 * Resolves the `Authorization` header value applicable to a URL, matching
 * npm's "nerf dart" scheme: credentials are keyed by the registry URL minus
 * its protocol (`//host/path/:_authToken=...`). The URL's path is walked
 * upward so credentials configured for a registry root also apply to
 * tarball URLs beneath it. Supports `_authToken` (Bearer), `_auth`
 * (pre-encoded Basic), and `username` + `_password` (base64-encoded, per
 * npm convention). Returns undefined when no credentials match.
 */
export function resolveAuthHeader (
  config: NpmrcConfig,
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const parsed = new URL(url)

  const segments = parsed.pathname.split('/').filter(segment => segment !== '')
  for (let depth = segments.length; depth >= 0; depth--) {
    const nerfDart = `//${parsed.host}/${segments.slice(0, depth).map(segment => `${segment}/`).join('')}`

    const authToken = getExpanded(config, `${nerfDart}:_authToken`, env)
    if (authToken !== undefined) {
      return `Bearer ${authToken}`
    }

    const auth = getExpanded(config, `${nerfDart}:_auth`, env)
    if (auth !== undefined) {
      return `Basic ${auth}`
    }

    const username = getExpanded(config, `${nerfDart}:username`, env)
    const password = getExpanded(config, `${nerfDart}:_password`, env)
    if (username !== undefined && password !== undefined) {
      const decodedPassword = Buffer.from(password, 'base64').toString('utf8')
      return `Basic ${Buffer.from(`${username}:${decodedPassword}`, 'utf8').toString('base64')}`
    }
  }

  return undefined
}
