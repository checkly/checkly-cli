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
     * Dependencies whose registry tarballs should be embedded into the
     * Playwright Check Suite code bundle, letting Checkly runners install
     * packages they cannot fetch themselves — e.g. packages from a private
     * registry that is only reachable from your own network. Has no effect
     * on browser or multistep checks.
     *
     * Each entry is a package name (`'@acme/private-utils'`), which embeds
     * every version of that package found in the workspace lockfile, or a
     * `name@version` pin (`'legacy-private-pkg@2.1.0'`) with an exact semver
     * version. Names may contain `*` wildcards (`'@acme/*'`, `'acme-*'`,
     * `'@acme/*-utils'`); each `*` matches any run of characters except
     * `/`, so a wildcard never crosses the scope separator. As long as a
     * wildcard matches at least one registry package, matches that are not
     * registry packages are skipped — workspace members silently, git/file/
     * URL dependencies with a warning (the runner must fetch those
     * itself); a wildcard whose only matches cannot be embedded, or that
     * matches nothing at all, is an error. A pattern embeds every lockfile
     * version of every package it matches, so scope it to the packages
     * the runner genuinely cannot fetch. List every package the runner
     * cannot fetch,
     * including private packages that only appear as (transitive)
     * dependencies of other private packages — dependencies of listed
     * packages are not embedded automatically.
     *
     * Tarballs are resolved against the workspace root lockfile
     * (`pnpm-lock.yaml` or `package-lock.json`), reused from local caches
     * (the CLI's own, then npm's) when possible and otherwise downloaded
     * from the registry configured in `.npmrc` (including scoped registries
     * and auth tokens), and always verified against the lockfile's recorded
     * integrity. Downloads are cached under the workspace root's
     * `node_modules/.cache/checkly`
     * (override with `CHECKLY_CACHE_DIR`; a per-user cache directory
     * serves as the fallback if the project location isn't writable), so
     * nothing lands in the project outside `node_modules`. In the code
     * bundle the tarballs land at
     * `.checkly/embedded-packages/*.tgz`, where Checkly runners serve them
     * through a local registry during dependency installation.
     */
    embeddedPackages?: string[]
    /**
     * Whether to automatically detect and embed dependencies that Checkly
     * runners cannot fetch from the public npm registry, in addition to
     * any explicit `embeddedPackages` entries. Defaults to `true`; the
     * `--no-detect-embedded-packages` flag overrides per run.
     *
     * Detection is free of network traffic when the effective registry is
     * the public one; with a private registry, undecided packages are
     * resolved by asking that registry which packages it hosts, and the
     * result is cached (keyed by the lockfile), so repeat runs cost
     * nothing. A detected package never overrides an explicit
     * `embeddedPackages` entry for the same name.
     *
     * Private package names never leave your machine by default: the
     * registry interrogation uses the Sonatype Nexus REST API of the
     * instance each package's lockfile-recorded source points at (the npm
     * credentials must be able to browse every npm hosted repository on
     * it). Packages whose lockfile records no source URL at all —
     * `pnpm-lock.yaml` records none — are classified by the configured
     * registry's inventory: hosted means embed, absent means public. A
     * recorded source that doesn't look like a Nexus content URL is
     * checked against the configured registry too, but only when it shares
     * that registry's host, and only to confirm a package is hosted there
     * — a package the instance doesn't host stays unclassified rather
     * than being assumed public. See `detectEmbeddedPackagesFallback` for
     * what happens to unclassified packages. Detection assumes proxy repositories on your
     * registry front the public npm registry — packages served through a
     * proxy of *another private* registry are not detected and should be
     * listed in `embeddedPackages` explicitly.
     */
    detectEmbeddedPackages?: boolean
    /**
     * What detection does with packages it cannot classify without
     * querying the public npm registry — because the registry's REST API
     * is not accessible with the configured npm credentials, because a
     * package's recorded source shares the configured registry's host but
     * is not hosted on it, or because the registry configuration itself
     * cannot be resolved (for example an unset environment variable
     * referenced in `.npmrc`, which is also warned about separately).
     * `'skip'` (the default) leaves them un-embedded and prints a warning;
     * `'public-registry'` allows integrity lookups against the public npm
     * registry — accurate for any registry product, but it transmits the
     * undecided package names (potentially private ones) to the public
     * registry. Verdicts obtained from the public registry are cached as
     * immutable proofs and continue to apply after the option is set back
     * to `'skip'`; clear the CLI cache to discard them.
     */
    detectEmbeddedPackagesFallback?: 'skip' | 'public-registry'
    /**
     * List of playwright checks that use the defined playwright config path
     */
    playwrightChecks?: PlaywrightSlimmedProp[]
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
       * to its usual inputs (lockfile, package.json and .npmrc files).
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
    validateEmbeddedPackages(config)

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

function validateEmbeddedPackages (config: ChecklyConfig): void {
  const detect = config.checks?.detectEmbeddedPackages
  if (detect !== undefined && typeof detect !== 'boolean') {
    throw new Error(`Config field 'checks.detectEmbeddedPackages' must be a boolean if set`)
  }

  const fallback = config.checks?.detectEmbeddedPackagesFallback
  if (fallback !== undefined && fallback !== 'skip' && fallback !== 'public-registry') {
    throw new Error(`Config field 'checks.detectEmbeddedPackagesFallback' must be 'skip' or 'public-registry' if set`)
  }

  const embeddedPackages = config.checks?.embeddedPackages
  if (embeddedPackages === undefined) {
    return
  }

  if (!Array.isArray(embeddedPackages)) {
    throw new Error(`Config field 'checks.embeddedPackages' must be an array of strings if set`)
  }

  for (const spec of embeddedPackages) {
    try {
      parseEmbeddedPackageSpec(spec)
    } catch (cause) {
      throw new Error(`Config field 'checks.embeddedPackages' is invalid: ${(cause as Error).message}`, { cause })
    }
  }
}
