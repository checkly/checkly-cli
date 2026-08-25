import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import Debug from 'debug'

import { parseComposableUrl, parseFetchableUrl } from './url.js'

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

/**
 * Where a config value came from. Structured rather than a display string:
 * an environment variable is named by its verbatim spelling, which is what
 * the user can actually search for — the key stored in the config map has
 * the prefix stripped and may be case-folded.
 */
export type ConfigOrigin =
  | { kind: 'file', path: string }
  | { kind: 'env', variable: string }

export interface LoadedNpmrcConfig {
  config: NpmrcConfig
  /** The config files consulted, highest precedence first. */
  files: string[]
  /**
   * Optional files that could not be read, and were therefore skipped. Any
   * credentials they hold went unused, which is worth saying out loud when
   * a download later fails to authenticate.
   */
  unreadable: string[]
  /**
   * Which source each key came from. A credential that a registry rejects
   * is far easier to fix when the error can name where it came from, which
   * the merged map alone cannot say.
   */
  origins: Map<string, ConfigOrigin>
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
 * Every `npm_config_*` variable in an environment, as the config key it
 * carries plus the variable's verbatim name. The prefix is matched
 * case-insensitively; the name is kept because only it is something the
 * user can search their environment for.
 */
function* npmConfigEnvEntries (
  env: NodeJS.ProcessEnv,
): Generator<{ key: string, value: string, variable: string }> {
  for (const [variable, value] of Object.entries(env)) {
    if (value === undefined || !variable.toLowerCase().startsWith(NPM_CONFIG_ENV_PREFIX)) {
      continue
    }
    const key = variable.slice(NPM_CONFIG_ENV_PREFIX.length)
    // npm drops env config entries with empty values rather than treating
    // them as set-to-empty.
    if (key === '' || value === '') {
      continue
    }
    yield { key, value, variable }
  }
}

/**
 * Records an env-derived entry under both the verbatim key and, unless one
 * is already present, its lowercased alias. Shared so that the config map
 * and the origins map cannot drift apart: they must key identically, or a
 * value resolves while its origin does not.
 */
function setEnvEntry<T> (map: Map<string, T>, key: string, value: T): void {
  map.set(key, value)
  if (!map.has(key.toLowerCase())) {
    map.set(key.toLowerCase(), value)
  }
}

/**
 * Extracts npm configuration from `npm_config_*` environment variables
 * (e.g. `npm_config_registry`, commonly set in CI and by package managers
 * running lifecycle scripts). In npm's precedence order these sit above
 * every `.npmrc` file. The key is stored both verbatim and lowercased,
 * because plain keys are written in any case (`NPM_CONFIG_REGISTRY`) while
 * nerf-darted auth keys carry a case-sensitive spelling
 * (`npm_config_//host/:_authToken`).
 */
export function npmrcConfigFromEnv (env: NodeJS.ProcessEnv): NpmrcConfig {
  const config: NpmrcConfig = new Map()

  for (const { key, value } of npmConfigEnvEntries(env)) {
    setEnvEntry(config, key, value)
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
  const origins = new Map<string, ConfigOrigin>()

  // Keyed exactly as the config map above, so every spelling that resolves
  // a value can also name the variable the user actually set.
  for (const { key, variable } of npmConfigEnvEntries(env)) {
    setEnvEntry<ConfigOrigin>(origins, key, { kind: 'env', variable })
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
        origins.set(key, { kind: 'file', path: filePath })
      }
    }
  }

  return { config: merged, files: files.map(file => file.path), unreadable, origins }
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
   * same way, and a scope-qualified key beats an unscoped one for the same
   * registry for the same reason.
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
  // npm matches config keys case-insensitively, so both spellings count.
  for (const candidate of key === key.toLowerCase() ? [key] : [key, key.toLowerCase()]) {
    const value = config.get(candidate)
    if (value !== undefined) {
      return { value: expandValue(candidate, value, env), key: candidate }
    }
  }
  return undefined
}

/**
 * The same lookup for a credential, where a blank value counts as no value
 * at all: an entry left empty rather than deleted — by a token rotation, or
 * a logout that clears the line — must not shadow a credential that still
 * works. npm and pnpm both test credential values for truthiness for the
 * same reason.
 *
 * What it falls through to is another *key*: another credential kind at the
 * same prefix, or a shallower nerf dart. That is as far as it goes, and
 * deliberately so — it matches npm, whose `hasAuth` likewise only tries
 * other credential kinds at the same or a shallower dart. It does not fall
 * through to the other case spelling of the same key, which would reach
 * past a blank into a different file.
 *
 * It does not reach the same key in a lower-precedence file: the merge in
 * `loadNpmrcConfig` is first-writer-wins per key, so a blank `_authToken`
 * in a project `.npmrc` still masks a working one in `~/.npmrc`. Skipping
 * blanks during the merge would fix that, and was tried, but it makes this
 * CLI send a credential npm and pnpm would not — they keep blank values
 * read from files — so a project that deliberately blanks an entry to force
 * anonymous access would have the developer's personal token sent instead.
 *
 * Deliberately confined to credentials. A blank `registry` is a broken
 * setting rather than an absent one, and treating it as absent would fall
 * back to the public registry and send private package names to it. That
 * holds for values read from files; a blank `npm_config_registry` never
 * reaches the config at all, because `npmConfigEnvEntries` drops empty
 * environment values at load, matching npm.
 *
 * A blank value and an unset `${VAR}` are deliberately not the same thing,
 * here as in npm and pnpm: a blank value is an entry that exists and holds
 * nothing, while an unset variable is a reference to something that does
 * not exist — a typo, or a secret missing from the environment — which
 * `expandValue` reports by name rather than papering over.
 */
function getCredentialEntry (
  config: NpmrcConfig,
  key: string,
  env: NodeJS.ProcessEnv,
): { value: string, key: string } | undefined {
  // `getExpandedEntry` already stops at the first spelling that exists, so
  // mapping its blank result to undefined is the whole difference.
  const entry = getExpandedEntry(config, key, env)
  return entry?.value === '' ? undefined : entry
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

/**
 * The registry a package resolves to, or the reason nothing can be
 * requested from it.
 *
 * A configured value is never quietly replaced by a default — resolving a
 * private package against the public registry would disclose its name — so
 * a broken one has to be reported rather than substituted. That is a
 * discriminated result rather than an unusable URL string because the
 * caller composes a path onto `url` and requests it: with
 * `registry=https://` the composed URL parses with the PACKAGE NAME as its
 * host, and the request, along with any credential nerf-darted to it, goes
 * to whoever owns that name. A rule that can send a token somewhere
 * unintended belongs in the type rather than in a comment a future caller
 * may not read.
 *
 * `key` names the entry to blame, absent only when nothing configured a
 * registry and the public npm one was assumed — which is always usable.
 */
export type ResolvedRegistry = UsableRegistry | { usable: false, key: string }

/** A registry a request can actually be composed for and sent to. */
export interface UsableRegistry {
  usable: true
  url: string
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

    // npm and pnpm both treat a blank `@scope:registry` as unset and use the
    // global `registry`, whatever that points at — including the public
    // registry, if that is what the project configured. Only a usable value
    // counts as the fallback: with nothing to fall back to, the blank entry
    // is kept, so the caller reports the key to fix instead of quietly
    // assuming the public registry nobody configured.
    if (registry?.value === '') {
      // An unexpandable global entry is no more usable than a missing one,
      // and reporting it would name a key that is not the one in use, so it
      // counts as nothing to fall back to.
      const fallback = attempt(() => getExpandedEntry(config, 'registry', env))
      if (fallback.error !== undefined) {
        debug('ignoring unusable global registry while %s is blank: %s', registry.key, fallback.error.message)
      }

      if (fallback.value !== undefined && fallback.value.value !== '') {
        debug('%s is blank, falling back to the registry configured by %s', registry.key, fallback.value.key)
        registry = fallback.value
      }
    }
  }

  registry ??= getExpandedEntry(config, 'registry', env)

  if (registry === undefined) {
    return { usable: true, url: DEFAULT_REGISTRY_URL }
  }

  // The trailing slash goes on first: it is part of what a registry URL
  // means here, and `//host/npm` composes differently from `//host/npm/`.
  const url = registry.value.endsWith('/') ? registry.value : `${registry.value}/`
  return parseComposableUrl(url) !== undefined
    ? { usable: true, url, key: registry.key }
    : { usable: false, key: registry.key }
}

export interface ResolvedAuth {
  /** The `Authorization` header value to send. */
  header: string
  /**
   * Every config key that contributed, in the spelling that matched.
   * Paired with `LoadedNpmrcConfig`'s `origins`, these name the file or
   * environment variable a rejected credential came from — indispensable
   * once several sources can supply one. `username` + `_password` yields
   * two keys rather than one: because precedence is
   * per key, the halves routinely come from different files, and the
   * password (the half that actually expires) is the one worth naming.
   */
  keys: string[]
}

/**
 * The nerf darts a URL's credentials may be keyed by, deepest path first:
 * `https://host/a/b` yields `//host/a/b/`, `//host/a/`, `//host/`. The path
 * is walked upward because a credential configured for a registry root
 * also applies to everything served beneath it.
 */
function nerfDarts (url: URL): string[] {
  const segments = url.pathname.split('/').filter(segment => segment !== '')

  const darts: string[] = []
  for (let depth = segments.length; depth >= 0; depth--) {
    const prefix = segments.slice(0, depth).map(segment => `${segment}/`).join('')
    darts.push(`//${url.host}/${prefix}`)
  }
  return darts
}

/**
 * The credentials configured under one key prefix, in npm's own order:
 * `_authToken` (Bearer), then `username` + `_password` (base64-encoded, per
 * npm convention), then `_auth` (pre-encoded Basic).
 *
 * A prefix is a nerf dart, optionally qualified by a scope
 * (`//host/:@acme`). Both halves of a `username` + `_password` pair must
 * live under the same prefix: pairing a scoped username with an unscoped
 * password would send a credential neither entry describes.
 *
 * pnpm's `tokenHelper` is deliberately absent from this list. It names an
 * external command to run for a token, and running a command found in a
 * config file is a decision well beyond resolving a credential. A user who
 * has only that configured resolves no credential here and fails as if
 * none were configured.
 */
function credentialsAt (
  config: NpmrcConfig,
  prefix: string,
  env: NodeJS.ProcessEnv,
  { skipUnexpandable = false }: { skipUnexpandable?: boolean } = {},
): ResolvedAuth | undefined {
  // `skipUnexpandable` is per key, not per prefix: one entry referencing a
  // variable that is not set says nothing about the other credential kinds
  // configured beside it.
  const entry = (kind: string) => {
    const key = `${prefix}:${kind}`
    try {
      return getCredentialEntry(config, key, env)
    } catch (err) {
      if (skipUnexpandable && err instanceof NpmrcEnvVarError) {
        debug('skipping credential %s: %s', key, err.message)
        return undefined
      }
      throw err
    }
  }

  const authToken = entry('_authToken')
  if (authToken !== undefined) {
    return { header: `Bearer ${authToken.value}`, keys: [authToken.key] }
  }

  // The pair outranks `_auth`, which is npm's order (`getCredentialsByURI`
  // tries `_authToken`, then `username` + `_password`, then `_auth`) and
  // matters when a legacy `_auth` line has been left behind beside a pair
  // written later: npm authenticates with the pair, and so must this.
  //
  // Neither half is worth failing over alone — a leftover `username` from a
  // setup that moved to a token must not abort a download that a credential
  // further along the walk would have authenticated. Whether a half is
  // usable is only knowable after expanding it, since a `${VAR}` set to the
  // empty string is as absent as a literal blank, so both are attempted and
  // an unexpandable one is held rather than thrown.
  const username = attempt(() => entry('username'))
  const password = attempt(() => entry('_password'))

  if (username.value !== undefined && password.value !== undefined) {
    const decodedPassword = Buffer.from(password.value.value, 'base64').toString('utf8')
    const encoded = Buffer.from(`${username.value.value}:${decodedPassword}`, 'utf8').toString('base64')
    return { header: `Basic ${encoded}`, keys: [username.value.key, password.value.key] }
  }

  // Both halves are here in some form, so the pair was meant and a variable
  // is genuinely missing — worth naming rather than falling through to a
  // credential the user did not intend to use.
  const unexpandable = username.error ?? password.error
  if (unexpandable !== undefined) {
    if (found(username) && found(password)) {
      throw unexpandable
    }
    // Dropped because its other half never materialised, so no pair was
    // ever going to form here. Traceable rather than silent: "the CLI
    // ignored my entry" is the report this explains.
    debug('ignoring half a credential pair at %s: %s', prefix, unexpandable.message)
  }

  const auth = entry('_auth')
  if (auth !== undefined) {
    return { header: `Basic ${auth.value}`, keys: [auth.key] }
  }

  return undefined
}

/** Whether a held lookup produced anything at all, usable or not. */
function found (attempted: { value?: unknown, error?: NpmrcEnvVarError }): boolean {
  return attempted.value !== undefined || attempted.error !== undefined
}

/**
 * Runs a lookup, holding an `NpmrcEnvVarError` instead of raising it so the
 * caller can decide whether the key it names was ever going to be used.
 */
function attempt<T> (lookup: () => T): { value?: T, error?: NpmrcEnvVarError } {
  try {
    return { value: lookup() }
  } catch (err) {
    if (err instanceof NpmrcEnvVarError) {
      return { error: err }
    }
    throw err
  }
}

/**
 * Resolves the `Authorization` header applicable to a URL, matching npm's
 * "nerf dart" scheme: credentials are keyed by the registry URL minus its
 * protocol (`//host/path/:_authToken=...`).
 *
 * `pnpm login --scope=@acme` writes a scope-qualified key instead
 * (`//host/:@acme:_authToken=...`, or equivalently `//host/@acme/:_authToken`),
 * so the package being downloaded decides which keys apply. Mirroring pnpm,
 * every scoped key is tried before any unscoped one — a shallow scoped
 * credential outranks a deeper unscoped one, rather than the two being
 * interleaved by depth. An unscoped package never falls back to a scoped
 * key: a scoped token belongs to one organisation by construction, and
 * reusing it elsewhere would send that organisation's credential somewhere
 * it was never meant to go.
 *
 * Scope-qualified keys are honored for every project, not only pnpm ones:
 * npm, yarn, bun and pnpm 10 ignore the spelling entirely, but writing one
 * is an unambiguous statement of which token that scope should use, and
 * refusing to read it would leave a user whose only login is
 * `pnpm login --scope` unauthenticated for exactly the packages the key
 * names.
 *
 * Returns undefined when no credentials match.
 */
export function resolveAuthHeader (
  config: NpmrcConfig,
  url: string,
  packageName: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedAuth | undefined {
  // The same rule the request itself has to pass. Callers check it first,
  // so this is belt and braces — but the safe answer for a URL that could
  // not be validated is no credentials rather than a thrown parse error.
  const parsed = parseFetchableUrl(url)
  if (parsed === undefined) {
    return undefined
  }

  const darts = nerfDarts(parsed)
  const scope = packageScope(packageName)

  const scoped = scope !== undefined ? darts.map(dart => `${dart}:${scope}`) : []
  for (const prefix of [...scoped, ...darts]) {
    const credentials = credentialsAt(config, prefix, env)
    if (credentials !== undefined) {
      return credentials
    }
  }

  // pnpm accepts a second spelling, `//host/@acme/:_authToken`, which it
  // binds to the registry the scope segment was stripped from rather than to
  // the path — so it covers every `@acme` package on that host, including
  // tarball URLs that never mention the scope at that depth, as GitHub
  // Packages' `/download/@acme/...` URLs do not.
  //
  // It is tried last rather than with the colon form, which is where pnpm
  // ranks it. The spelling is indistinguishable from an ordinary nerf dart
  // for the path `/@acme/`, which is exactly how npm, yarn and bun read it,
  // so giving it pnpm's rank would let it outrank a deeper unscoped key that
  // authenticates a working setup today.
  //
  // Tried last it can only supply a credential where nothing else matched,
  // and an unexpandable one is skipped rather than fatal — but only when
  // this walk is the sole reading of that key. For a URL whose path does
  // contain the scope, such as the `${registry}/@acme/foo/-/…` this CLI
  // composes, `//host/@acme/` is an ordinary nerf dart the unscoped walk
  // above already visited, and there it is a key that plainly applies to
  // this request, so a variable missing from it is fatal like any other.
  // The tolerance is for the other shape — GitHub Packages' `/download/…`,
  // or a CDN URL — where the key names a location this request never
  // touches and must not abort a download that would otherwise go out.
  //
  // A skip is only visible on the debug channel, so a download that then
  // fails to authenticate reports finding no credentials at all.
  const pathForm = scope !== undefined ? darts.map(dart => `${dart}${scope}/`) : []
  for (const prefix of pathForm) {
    const credentials = credentialsAt(config, prefix, env, { skipUnexpandable: true })
    if (credentials !== undefined) {
      return credentials
    }
  }

  return undefined
}
