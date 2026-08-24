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

/** The prefix that marks an environment variable as npm configuration. */
export const NPM_CONFIG_ENV_PREFIX = 'npm_config_'

/** Origin label for keys taken from `npm_config_*` environment variables. */
export const ENV_CONFIG_ORIGIN = `${NPM_CONFIG_ENV_PREFIX}* environment variables`

export interface LoadedNpmrcConfig {
  config: NpmrcConfig
  /** Every config source consulted, highest precedence first. */
  sources: string[]
  /**
   * Optional files that could not be read, and were therefore skipped. Any
   * credentials they hold went unused, which is worth saying out loud when
   * a download later fails to authenticate.
   */
  unreadable: string[]
  /**
   * Which source each key came from. A credential that a registry rejects
   * is far easier to fix when the error can name the file it came from,
   * which the merged map alone cannot say.
   */
  origins: Map<string, string>
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
      // Not necessarily an .npmrc: the value may equally have come from
      // pnpm's auth.ini or an npm_config_* environment variable.
      `The npm configuration value for '${key}' references the environment`
      + ` variable '${varName}', which is not set`,
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

  const prefix = NPM_CONFIG_ENV_PREFIX
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
): Promise<LoadedNpmrcConfig> {
  const merged: NpmrcConfig = npmrcConfigFromEnv(env)
  const unreadable: string[] = []
  const origins = new Map<string, string>()

  for (const key of merged.keys()) {
    origins.set(key, ENV_CONFIG_ORIGIN)
  }

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
      // It is still recorded so an authentication failure can say the file
      // was skipped. Note this covers more than bad permissions on the file
      // itself — an unsearchable parent directory lands here too — so the
      // reported wording must not claim the file exists.
      if (!optional) {
        throw new Error(`Unable to read npm configuration from '${filePath}'`, { cause: err })
      }
      debug('skipping unreadable optional config %s: %s', filePath, (err as Error).message)
      unreadable.push(filePath)
      continue
    }
    for (const [key, value] of parseNpmrc(content)) {
      if (!merged.has(key)) {
        merged.set(key, value)
        origins.set(key, filePath)
      }
    }
  }

  // The env channel outranks every file and is always consulted, so it
  // belongs in any list of places a credential could have been configured.
  const sources = [ENV_CONFIG_ORIGIN, ...files.map(file => file.path)]

  return { config: merged, sources, unreadable, origins }
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

/**
 * Looks a key up, falling back to its lowercased spelling, and reports
 * which spelling actually matched. Callers that trace a value back to the
 * file it came from need the matched key, not the one they asked for: only
 * the former is a key in `LoadedNpmrcConfig`'s `origins`.
 */
function getExpandedEntry (
  config: NpmrcConfig,
  key: string,
  env: NodeJS.ProcessEnv,
): { value: string, key: string } | undefined {
  for (const candidate of key === key.toLowerCase() ? [key] : [key, key.toLowerCase()]) {
    const value = config.get(candidate)
    if (value !== undefined) {
      return { value: expandValue(candidate, value, env), key: candidate }
    }
  }
  return undefined
}

/**
 * The scope of a package name (`@acme/foo` → `@acme`), or undefined when
 * the name is unscoped. A leading `@` with no slash is not a scope: it is a
 * malformed name, and treating it as one would silently truncate it.
 */
function packageScope (packageName: string): string | undefined {
  if (!packageName.startsWith('@')) {
    return undefined
  }
  const separator = packageName.indexOf('/')
  return separator > 1 ? packageName.slice(0, separator) : undefined
}

export interface ResolvedRegistry {
  /** The registry URL, always ending in a slash. */
  url: string
  /**
   * The config key that supplied it, absent when nothing configured one and
   * the public npm registry was assumed. Reported for the same reason as
   * `ResolvedAuth.key`: a registry URL can itself carry credentials, and a
   * failure needs to name where that URL was configured.
   */
  key?: string
}

/**
 * Resolves the registry for a package name: the `@scope:registry` entry if
 * the package is scoped and one exists, the `registry` entry otherwise,
 * falling back to the public npm registry.
 */
export function resolveRegistry (
  config: NpmrcConfig,
  packageName: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedRegistry {
  let registry: { value: string, key: string } | undefined

  const scope = packageScope(packageName)
  if (scope !== undefined) {
    registry = getExpandedEntry(config, `${scope}:registry`, env)
  }

  registry ??= getExpandedEntry(config, 'registry', env)

  if (registry === undefined) {
    return { url: DEFAULT_REGISTRY_URL }
  }

  return {
    url: registry.value.endsWith('/') ? registry.value : `${registry.value}/`,
    key: registry.key,
  }
}

export interface ResolvedAuth {
  /** The `Authorization` header value to send. */
  header: string
  /**
   * Every config key that contributed, in the spelling that matched.
   * Paired with `LoadedNpmrcConfig`'s `origins`, these name the files a
   * rejected credential came from — indispensable once several files can
   * supply one. `username` + `_password` yields two: because precedence is
   * per key, the halves routinely come from different files, and the
   * password (the half that actually expires) is the one worth naming.
   */
  keys: string[]
}

/**
 * Resolves the `Authorization` header applicable to a URL, matching npm's
 * "nerf dart" scheme: credentials are keyed by the registry URL minus its
 * protocol (`//host/path/:_authToken=...`). The URL's path is walked
 * upward so credentials configured for a registry root also apply to
 * tarball URLs beneath it. Supports `_authToken` (Bearer), `_auth`
 * (pre-encoded Basic), and `username` + `_password` (base64-encoded, per
 * npm convention). Returns undefined when no credentials match.
 */
export function resolveAuthHeader (
  config: NpmrcConfig,
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedAuth | undefined {
  const parsed = new URL(url)

  const segments = parsed.pathname.split('/').filter(segment => segment !== '')
  for (let depth = segments.length; depth >= 0; depth--) {
    const nerfDart = `//${parsed.host}/${segments.slice(0, depth).map(segment => `${segment}/`).join('')}`

    const authToken = getExpandedEntry(config, `${nerfDart}:_authToken`, env)
    if (authToken !== undefined) {
      return { header: `Bearer ${authToken.value}`, keys: [authToken.key] }
    }

    const auth = getExpandedEntry(config, `${nerfDart}:_auth`, env)
    if (auth !== undefined) {
      return { header: `Basic ${auth.value}`, keys: [auth.key] }
    }

    const username = getExpandedEntry(config, `${nerfDart}:username`, env)
    const password = getExpandedEntry(config, `${nerfDart}:_password`, env)
    if (username !== undefined && password !== undefined) {
      const decodedPassword = Buffer.from(password.value, 'base64').toString('utf8')
      const encoded = Buffer.from(`${username.value}:${decodedPassword}`, 'utf8').toString('base64')
      return { header: `Basic ${encoded}`, keys: [username.key, password.key] }
    }
  }

  return undefined
}
