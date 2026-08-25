import * as path from 'path'
import fs from 'node:fs/promises'
import { findPlaywrightConfigPath, getDefaultChecklyConfig, writeChecklyConfigFile } from './util.js'
import { CheckProps, RuntimeCheckProps } from '../constructs/check.js'
import { PlaywrightCheckProps } from '../constructs/playwright-check.js'
import { Session } from '../constructs/index.js'
import { Construct } from '../constructs/construct.js'
import type { Region } from '../index.js'
import { ReporterType } from '../reporters/reporter.js'
import { PlaywrightConfig } from '../constructs/playwright-config.js'
import { FileLoader } from '../loader/index.js'
import { normalizeDependencyCacheVersion } from './check-parser/cache-hash.js'
import { BundlePackagesPrune, normalizePackagePrune } from './check-parser/package-prune.js'
import { parseEmbeddedPackageSpec } from './embedded-packages/spec.js'

export type CheckConfigDefaults =
  Pick<CheckProps,
  | 'activated'
  | 'alertChannels'
  | 'alertEscalationPolicy'
  | 'doubleCheck'
  | 'frequency'
  | 'locations'
  | 'muted'
  | 'privateLocations'
  | 'retryStrategy'
  | 'shouldFail'
  | 'tags'
  >
  & Pick<RuntimeCheckProps,
  | 'environmentVariables'
  | 'runtimeId'
  >
  // This is used by BrowserChecks and MultiStepChecks.
  & { playwrightConfig?: PlaywrightConfig }

export type PlaywrightSlimmedProp = Pick<PlaywrightCheckProps, 'name' | 'activated'
  | 'muted' | 'shouldFail' | 'locations' | 'tags' | 'frequency' | 'environmentVariables'
  | 'alertChannels' | 'privateLocations' | 'alertEscalationPolicy'
  | 'pwProjects' | 'pwTags' | 'installCommand' | 'testCommand' | 'group' | 'groupName' | 'runParallel'
  | 'engine'> & { logicalId: string, playwrightConfigPath?: string }

export type ChecklyConfig = {
  /**
   * Friendly name for your project.
   */
  projectName: string
  /**
   * Unique project identifier.
   */
  logicalId: string
  /**
   * Git repository URL.
   */
  repoUrl?: string
  /**
   * Checks default configuration properties.
   */
  checks?: CheckConfigDefaults & {
    /**
     * Glob pattern where the CLI looks for files containing Check constructs, i.e. all `.checks.ts` files
     */
    checkMatch?: string | string[]
    /**
     * List of glob patterns with directories to ignore.
     */
    ignoreDirectoriesMatch?: string[]

    playwrightConfig?: PlaywrightConfig

    /**
     * Browser checks default configuration properties.
     */
    browserChecks?: CheckConfigDefaults & {
      /**
       * Glob pattern where the CLI looks for Playwright test files, i.e. all `.spec.ts` files
       */
      testMatch?: string | string[]
    }
    /**
     * Multistep checks default configuration properties.
     */
    multiStepChecks?: CheckConfigDefaults & {
      /**
       * Glob pattern where the CLI looks for Playwright test files, i.e. all `.spec.ts` files
       */
      testMatch?: string | string[]
    }
    /**
     * Playwright config path to be used during bundling and playwright config parsing
     */
    playwrightConfigPath?: string

    /**
     * Extra files to be included into the playwright bundle
     */
    include?: string | string[]
    /**
     * List of playwright checks that use the defined playwright config path
     */
    playwrightChecks?: PlaywrightSlimmedProp[]
  }
  /**
   * Code-bundle configuration properties.
   */
  bundle?: {
    /**
     * Configuration for npm packages shipped inside the code bundle.
     */
    packages?: {
      /**
       * Dependencies to embed into the code bundle, letting Checkly runners
       * install packages they cannot fetch themselves — e.g. packages from a
       * private registry that is only reachable from your own network.
       * Applies to Playwright Check Suites only.
       *
       * Each entry is a package name (`'@acme/private-utils'`), which embeds
       * every version of that package found in the workspace lockfile, or an
       * exact `name@version` pin (`'legacy-private-pkg@2.1.0'`). Names may
       * contain `*` wildcards (`'@acme/*'`, `'acme-*'`); a wildcard never
       * crosses the `/` scope separator. List every package the runner
       * cannot fetch, including private packages that only appear as
       * transitive dependencies of other private packages — dependencies of
       * listed packages are not embedded automatically.
       *
       * A `!` prefix turns an entry into an exclusion, which removes the
       * packages it matches from what the entries *before* it selected.
       * Entries therefore apply in order: `['@acme/*', '!@acme/legacy']`
       * embeds the whole scope except `@acme/legacy`, while the reverse
       * order embeds the whole scope, because the exclusion runs before
       * anything has been selected. An exclusion that removes nothing is a
       * no-op rather than an error. Removing every package an entry
       * selected also silences that entry: no "not found" error, and no
       * "cannot be embedded" warning even for packages it matched but did
       * not exclude — run with `DEBUG='checkly:cli:services:embedded-packages'`
       * to see what it reached. Since exclusions only subtract, a list of
       * nothing but exclusions selects nothing; a configuration whose
       * entries select no packages at all is reported as a warning.
       *
       * Only npm, pnpm, bun and Yarn Berry are supported at this time:
       * packages are resolved against the workspace lockfile
       * (`pnpm-lock.yaml`, `package-lock.json`, the text `bun.lock` —
       * bun's binary `bun.lockb` is not supported — or a Yarn Berry
       * `yarn.lock`; Yarn Classic v1 lockfiles are not) and always
       * verified against its recorded integrity hashes. Yarn Berry
       * lockfiles record no npm tarball integrity, so it is resolved from
       * the registry's package metadata instead — one small metadata
       * request per embedded package on every deploy, even with a warm
       * cache. Downloads read registry credentials from `npm_config_*`
       * environment variables, the project, workspace-root and user
       * `.npmrc` files, and pnpm's global `auth.ini` (where `pnpm login`
       * writes tokens on pnpm 11 and later), including the
       * scope-qualified keys `pnpm login --scope` writes. bun or yarn
       * users whose credentials live solely in `bunfig.toml` or
       * `.yarnrc.yml` must duplicate them into `.npmrc` or set
       * `npm_config_*` — referencing a token through an environment
       * variable (`${NPM_TOKEN}`), never as plaintext, because `.npmrc`
       * is uploaded with the code bundle. When the bundled lockfile is pruned to the code
       * bundle's contents, the embedded set follows it: packages the pruned
       * lockfile no longer references — dependencies of workspace members
       * that are not part of the bundle — are neither embedded nor
       * downloaded, even if an entry matches them. That usually means the
       * runner does not need the package at all; if the checks genuinely
       * need it, make the depending workspace member part of the bundle
       * rather than disabling pruning (`CHECKLY_LOCKFILE_PRUNE=0` restores
       * the unfiltered set, as a last resort). Changing the resolved set of
       * embedded packages invalidates the runner's dependency cache.
       */
      embed?: string[]
      /**
       * Dependencies to remove from the `package.json` files shipped inside
       * the code bundle — the workspace root's and every bundled workspace
       * member's. Applies to Playwright Check Suites only. The files on
       * disk are never modified; only the bundled copies are rewritten.
       *
       * The manifests are rewritten before the bundled lockfile is pruned
       * to the code bundle's contents, so the removed dependencies fall out
       * of the bundled lockfile too. This is the escape hatch for
       * dependencies that lockfile pruning alone cannot drop: with pnpm's
       * `auto-install-peers`, a bundled member's unused `peerDependencies`
       * are resolved as real dependencies of the regenerated lockfile even
       * though the bundled code never imports them. Because the rewritten
       * manifests only make sense next to a matching lockfile, the option
       * requires lockfile pruning: if the bundled lockfile cannot be pruned
       * in the same run — an unsupported package manager, a failed
       * regeneration, or `CHECKLY_LOCKFILE_PRUNE=0` — the original
       * manifests ship unchanged, with a warning. A bundle that ships no
       * lockfile has nothing to fall out of sync with, so the pruned
       * manifests always ship there.
       *
       * Accepts either an array of package name patterns, removed from
       * every dependency class (`dependencies`, `devDependencies`,
       * `peerDependencies` and `optionalDependencies`), or an object keyed
       * by dependency class whose values are `true` (remove the whole
       * class) or a pattern array (remove matching entries from that class
       * only). Names may contain `*` wildcards (`'@acme/*'`, `'acme-*'`);
       * a wildcard never crosses the `/` scope separator, so a bare `'*'`
       * matches only unscoped names — to remove a whole class, use `true`,
       * not `['*']`. A `!` prefix turns an entry into an exclusion that
       * removes what it matches from the entries *before* it selected,
       * with `bundle.packages.embed`'s order-sensitive semantics:
       * `['@acme/*', '!@acme/keep']` removes the scope except
       * `@acme/keep`, while the reverse order removes the whole scope
       * because the exclusion runs before anything has been selected. To
       * remove a whole class *except* some packages, select everything
       * first: `['*', '@*\/*', '!@acme/keep']` — remove the `\` when
       * copying; it exists only because `*` followed by `/` would end
       * this comment. `true` cannot be combined with exclusions. Unlike
       * `bundle.packages.embed` there are no
       * `name@version` pins; they are rejected at config load. Removed
       * `peerDependencies` take their `peerDependenciesMeta` entries with
       * them, and `peerDependencies: true` clears `peerDependenciesMeta`
       * entirely.
       *
       * Pruning is not validated against the code: you are responsible for
       * not removing anything the bundled code actually needs at runtime.
       * A pattern that matches nothing is not an error. Changing the
       * pruned output invalidates the runner's dependency cache.
       */
      prune?: BundlePackagesPrune
    }
  }
  /**
   * Caching-related configuration properties.
   */
  caching?: {
    /**
     * Controls the dependency cache used by Checkly runners when executing
     * the Playwright Check Suite code bundle. Has no effect on browser or
     * multistep checks.
     */
    dependencyCache?: {
      /**
       * Optional value mixed into the code bundle's cache hash in addition
       * to its usual inputs — the workspace's dependency-install inputs.
       * The exhaustive input list lives with the hash itself; see
       * `ComposeCacheHashInput` in
       * `services/check-parser/cache-hash.ts`.
       * Change the value to force runners to reinstall the bundle's
       * dependencies. Setting it for the first time invalidates the cache
       * once. Numbers must be safe integers; unset and empty string leave
       * the hash unchanged, so a dynamic value such as
       * `process.env.DEPENDENCY_CACHE_VERSION` behaves sanely when the
       * environment variable is missing.
       *
       * Unlike the `--refresh-cache` flag available on the run/test
       * commands, which forces a reinstall for a single ad-hoc run, this
       * value is persistent and also applies to deployed, scheduled
       * checks.
       */
      version?: string | number
    }
  }
  /**
   * CLI default configuration properties.
   */
  cli?: {
    runLocation?: keyof Region
    privateRunLocation?: string
    verbose?: boolean
    reporters?: ReporterType[]
    retries?: number
    loader?: FileLoader
  }
}

function isString (obj: any) {
  return (Object.prototype.toString.call(obj) === '[object String]')
}

export async function getChecklyConfigFile (): Promise<{ checklyConfig: string, fileName: string } | undefined> {
  const filenames = [
    'checkly.config.ts',
    'checkly.config.mts',
    'checkly.config.cts',
    'checkly.config.js',
    'checkly.config.mjs',
    'checkly.config.cjs',
  ]
  let config
  for (const configFile of filenames) {
    const dir = path.resolve(path.dirname(configFile))
    const configFilePath = path.resolve(dir, configFile)
    try {
      await fs.access(configFilePath, fs.constants.R_OK)
    } catch {
      continue
    }
    const file = await fs.readFile(configFilePath)
    if (file) {
      config = {
        checklyConfig: file.toString(),
        fileName: configFile,
      }
      break
    }
  }
  return config
}

export class ConfigNotFoundError extends Error {
  searchPaths: string[]
  configFiles: string[]

  constructor (searchPaths: string[], configFiles: string[], options?: ErrorOptions) {
    const message = `Unable to detect a Checkly configuration file in any of the following paths:`
      + `\n\n`
      + `${searchPaths.map(searchPath => `  ${searchPath}`).join('\n')}`
      + `\n\n`
      + `Configuration files we looked for:`
      + `\n\n`
      + `${configFiles.map(lockfile => `  ${lockfile}`).join('\n')}`
    super(message, options)
    this.name = 'ConfigNotFoundError'
    this.searchPaths = searchPaths
    this.configFiles = configFiles
  }
}

export const defaultFilenames = [
  'checkly.config.ts',
  'checkly.config.mts',
  'checkly.config.cts',
  'checkly.config.js',
  'checkly.config.mjs',
  'checkly.config.cjs',
]

export async function loadChecklyConfig (
  dir: string,
  filenames = defaultFilenames,
  writeChecklyConfig: boolean = true,
  playwrightConfigPath?: string,
): Promise<{ config: ChecklyConfig, constructs: Construct[] }> {
  Session.loadingChecklyConfigFile = true
  try {
    let config: ChecklyConfig | undefined
    Session.checklyConfigFileConstructs = []
    for (const filename of filenames) {
      const filePath = path.join(dir, filename)
      try {
        await fs.access(filePath, fs.constants.R_OK)
      } catch {
        continue
      }
      config = await Session.loadFile<ChecklyConfig>(filePath)
      break
    }
    if (!config) {
      config = await handleMissingConfig(dir, filenames, writeChecklyConfig, playwrightConfigPath)
    }
    validateConfigFields(config, ['logicalId', 'projectName'] as const)
    validateDependencyCacheVersion(config)
    validateBundle(config)

    const constructs = Session.checklyConfigFileConstructs

    Session.checklyConfigFileConstructs = []
    if (config.cli?.loader) {
      Session.loader = config.cli.loader
    }
    return { config, constructs }
  } finally {
    Session.loadingChecklyConfigFile = false
  }
}

async function handleMissingConfig (
  dir: string,
  filenames: string[],
  shouldWriteConfig: boolean = true,
  pwPath?: string,
): Promise<ChecklyConfig> {
  const baseName = path.basename(dir)
  const playwrightConfigPath = pwPath ?? findPlaywrightConfigPath(dir)
  if (playwrightConfigPath) {
    const checklyConfig = getDefaultChecklyConfig(baseName, `./${path.relative(dir, playwrightConfigPath)}`)
    if (shouldWriteConfig) {
      await writeChecklyConfigFile(dir, checklyConfig)
    }
    return checklyConfig
  }
  throw new ConfigNotFoundError([dir], filenames)
}

function validateConfigFields (config: ChecklyConfig, fields: (keyof ChecklyConfig)[]): void {
  for (const field of fields) {
    if (!config?.[field] || !isString(config[field])) {
      throw new Error(`Config object missing a ${field} as type string`)
    }
  }
}

function validateDependencyCacheVersion (config: ChecklyConfig): void {
  try {
    normalizeDependencyCacheVersion(config.caching?.dependencyCache?.version)
  } catch (cause) {
    throw new Error(
      `Config field 'caching.dependencyCache.version' must be a string or a safe integer if set`,
      { cause },
    )
  }
}

function validateBundle (config: ChecklyConfig): void {
  const { bundle } = config
  if (bundle === undefined) {
    return
  }

  // A misshapen `bundle` block would otherwise read as `embed: undefined`
  // and silently disable embedding, surfacing only as an install failure on
  // the runner. Plain-JS configs bypass the TypeScript type, so the shape
  // must be enforced at runtime.
  if (bundle === null || typeof bundle !== 'object' || Array.isArray(bundle)) {
    throw new Error(`Config field 'bundle' must be an object if set`)
  }

  const { packages } = bundle
  if (packages === undefined) {
    return
  }

  if (packages === null || typeof packages !== 'object' || Array.isArray(packages)) {
    throw new Error(`Config field 'bundle.packages' must be an object if set`)
  }

  try {
    normalizePackagePrune(packages.prune)
  } catch (cause) {
    throw new Error(`Config field 'bundle.packages.prune' is invalid: ${(cause as Error).message}`, { cause })
  }

  const embeddedPackages = packages.embed
  if (embeddedPackages === undefined) {
    return
  }

  if (!Array.isArray(embeddedPackages)) {
    throw new Error(`Config field 'bundle.packages.embed' must be an array of strings if set`)
  }

  for (const spec of embeddedPackages) {
    try {
      parseEmbeddedPackageSpec(spec)
    } catch (cause) {
      throw new Error(`Config field 'bundle.packages.embed' is invalid: ${(cause as Error).message}`, { cause })
    }
  }
}
