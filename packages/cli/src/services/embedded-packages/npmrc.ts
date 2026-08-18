import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

export const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org/'

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
  filePaths: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<NpmrcConfig> {
  const merged: NpmrcConfig = npmrcConfigFromEnv(env)

  for (const filePath of filePaths) {
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (err: any) {
      if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR' || err?.code === 'EISDIR') {
        continue
      }
      // An unreadable .npmrc (e.g. bad permissions) must not silently drop
      // registry credentials — that would surface later as a baffling 401.
      throw new Error(`Unable to read npm configuration from '${filePath}'`, { cause: err })
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
 * The `.npmrc` locations relevant to a project, in npm's precedence order:
 * the directory the Checkly project lives in (the nearest project config,
 * which may be a workspace member), the workspace root, then the
 * user-level file — `~/.npmrc`, or the file `npm_config_userconfig` names,
 * matching npm's own userconfig override. (npm's global and builtin
 * configs are not consulted.)
 */
export function defaultNpmrcPaths (
  workspaceRoot: string,
  homedir = os.homedir(),
  contextDir?: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const userconfig = env.npm_config_userconfig ?? env.NPM_CONFIG_USERCONFIG
  const paths = [
    ...(contextDir !== undefined ? [path.join(contextDir, '.npmrc')] : []),
    path.join(workspaceRoot, '.npmrc'),
    userconfig !== undefined && userconfig !== ''
      ? expandTilde(userconfig, homedir)
      : path.join(homedir, '.npmrc'),
  ]
  return [...new Set(paths)]
}

/**
 * npm treats path-type config values starting with `~` as home-relative
 * (a quoted `NPM_CONFIG_USERCONFIG="~/.npmrc-work"` reaches us with the
 * tilde literal). Left unexpanded, the path would silently ENOENT and drop
 * the user-level config entirely.
 */
function expandTilde (value: string, homedir: string): string {
  if (value === '~') {
    return homedir
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(homedir, value.slice(2))
  }
  return value
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
 * The registry-affecting configuration entries (`registry` and
 * `@scope:registry`), with `${VAR}` references expanded against the given
 * environment (kept verbatim when the variable is unset, so the result is
 * deterministic). Sorted by key. Used to key detection caches: the
 * *effective* registry mapping must invalidate them, including when only a
 * referenced environment variable changes.
 */
export function expandedRegistryEntries (
  config: NpmrcConfig,
  env: NodeJS.ProcessEnv = process.env,
): Array<[string, string]> {
  return expandedEntries(config, env, key => key === 'registry' || key.endsWith(':registry'))
}

function expandedEntries (
  config: NpmrcConfig,
  env: NodeJS.ProcessEnv,
  keep: (key: string) => boolean,
): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  for (const [key, value] of config) {
    if (!keep(key)) {
      continue
    }
    let expanded: string
    try {
      expanded = expandValue(key, value, env)
    } catch {
      expanded = value
    }
    entries.push([key, expanded])
  }
  return entries.sort(([a], [b]) => a.localeCompare(b))
}

/**
 * The credential configuration entries (nerf-darted `//host/...:key`
 * lines), with `${VAR}` references expanded against the given environment
 * (kept verbatim when the variable is unset). Sorted by key. Used to key
 * detection caches: rotating a token — including through the standard
 * `${NPM_TOKEN}` indirection — must invalidate them, since the registry
 * API filters results by permission. Values only ever feed a hash.
 */
export function expandedCredentialEntries (
  config: NpmrcConfig,
  env: NodeJS.ProcessEnv = process.env,
): Array<[string, string]> {
  return expandedEntries(config, env, key => key.startsWith('//'))
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
