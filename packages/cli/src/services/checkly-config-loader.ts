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
import { Registries, validateRegistries } from './runner/registries.js'

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
  | 'engine' | 'workingDir'> & { logicalId: string, playwrightConfigPath?: string }

export type ChecklyConfig<UpstreamName extends string = string> = {
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
       * contain `*` wildcards (`'@acme/*'`, `'acme-*'`); a single `*` never
       * crosses the `/` scope separator, while a `**` does — `'**'` matches
       * every package, and `'**-foo'` matches names ending in `-foo` in any
       * scope or none. Directly before a `/`, a `**` may together with that
       * `/` also match nothing, glob-style: `'**' + '/utils'` (one string;
       * split here only because `*` followed by `/` would end this comment)
       * matches both `utils` and `@acme/utils`. (Earlier CLI releases
       * treated a run of stars as a single `*`.) List every package the
       * runner
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
       * Accepts either an array of entries, or an object keyed
       * by dependency class (`dependencies`, `devDependencies`,
       * `peerDependencies` and `optionalDependencies`) whose values are
       * `true` (remove the whole class) or a pattern array (remove
       * matching entries from that class only). An array entry is a
       * package name pattern — removed from every dependency class of
       * every bundled manifest — or a member-scoped object (below).
       * Names may contain `*` wildcards (`'@acme/*'`, `'acme-*'`);
       * a single `*` never crosses the `/` scope separator, so a bare
       * `'*'` matches only unscoped names, while a `**` does cross it —
       * to remove a whole class, use `true` or `['**']`, not `['*']`.
       * Wildcards follow `bundle.packages.embed`'s rules, including the
       * glob-style zero-segment match of a `**` directly before a `/`.
       * (Earlier CLI releases treated a run of stars as a single `*`.)
       * A `!` prefix turns an entry into an exclusion that
       * removes what it matches from the entries *before* it selected,
       * with `bundle.packages.embed`'s order-sensitive semantics:
       * `['@acme/*', '!@acme/keep']` removes the scope except
       * `@acme/keep`, while the reverse order removes the whole scope
       * because the exclusion runs before anything has been selected. To
       * remove a whole class *except* some packages, select everything
       * first: `['**', '!@acme/keep']`.
       * In the class-keyed form `true` cannot be combined with
       * exclusions. Unlike `bundle.packages.embed` there are no
       * `name@version` pins; they are rejected at config load. Removed
       * `peerDependencies` take their `peerDependenciesMeta` entries with
       * them, and `peerDependencies: true` clears `peerDependenciesMeta`
       * entirely.
       *
       * A member-scoped entry — `{ member, remove }` or `{ member, keep }`
       * — applies only to the workspace members whose manifest `name` the
       * `member` pattern list selects, with the same wildcard and
       * `!`-exclusion grammar and ordering as the name patterns
       * (`['@acme/**', '!@acme/e2e']`). `'.'` selects the workspace root
       * (`'!.'` excludes it), and is the only selector for a root
       * manifest that has no `name` field.
       * `remove` subtracts like the global patterns and composes
       * with the other entries in listed order: a pattern list applies to
       * every dependency class, a class-keyed object to the mentioned
       * classes only, and inside these entries `true` is exactly the
       * `['**']` catch-all — a later exclusion can still spare entries
       * from it, and only the meta entries of actually-removed peers go
       * with it. `keep` inverts the reading: it declares the member's
       * entire remaining dependency set. Entries it does not select are
       * removed, classes a class-keyed `keep` does not mention are
       * emptied, and no other entry can remove a kept name — one `keep`
       * entry fully determines the member's bundled manifest regardless
       * of entry order, and multiple `keep` entries matching the same
       * member combine. An empty `keep` (`[]` or `{}`) is the explicit
       * spelling for "keep nothing": it empties every dependency class
       * of the matched members, deliberately without a warning. An
       * entry carries exactly one of `remove` and
       * `keep`. Prefer exact member names with `keep`: a wildcard can
       * sweep a future member into a keep set written for another
       * package. As a safety net, a `member` selector that matches no
       * member of the workspace at all warns at bundling time — a
       * selector for a real member the current run merely did not
       * bundle stays quiet, visible only in the `DEBUG` reach log —
       * and so does a keep pattern (exclusions and the bare `'**'`
       * catch-all aside) that ends up keeping nothing in a matched
       * member this run bundled — members outside the bundle are not
       * inspected. When one keep list serves several members and keeps
       * warning about members that legitimately do not declare some of
       * the kept packages, split it into per-member entries with
       * tailored lists.
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
   * Configuration applied on the Checkly runner when it executes checks.
   */
  runner?: {
    /**
     * Registry routing for the dependency install of a Playwright Check
     * Suite code bundle. Use this when the registries your `.npmrc` (or
     * `pnpm-workspace.yaml` / `.yarnrc.yml`) points at resolve fine on
     * the machine running the CLI but are unreachable from Checkly
     * runners — e.g. a VPN-only mirror. When set, the runner installs
     * packages through a local registry that selects upstreams according
     * to these rules instead of the registries named in bundled config
     * files; embedded packages (`bundle.packages.embed`) always take
     * priority regardless of the rules. Applies to Playwright Check
     * Suites only, and only on the runner: operations on the machine
     * running the CLI — embedded-package downloads, lockfile pruning —
     * still read `.npmrc` and `npm_config_*` credentials.
     *
     * `upstreams` names the registries the runner may fetch from. Each
     * needs a base `url` (an absolute http(s) URL without query,
     * fragment or inline credentials, since package paths are appended
     * to it) and may carry bearer `auth`. An auth token must be exactly
     * one environment variable reference in `${VAR}` syntax (e.g.
     * `'${NPM_TOKEN}'`, in single quotes so the shell-like syntax is not
     * expanded locally): the value is resolved from the check's
     * environment variables on the runner, so the secret value appears
     * in neither the config nor the uploaded code bundle. Any literal
     * token content is rejected at config load.
     *
     * `packages` routes package names to upstreams, first match wins,
     * top-down. Patterns use the same wildcard syntax as
     * `bundle.packages.embed` (a single `*` never crosses the `/` scope
     * separator, `**` does), but no `!` exclusions and no
     * `name@version` pins. Each rule lists one or more upstream names
     * tried in order — the first upstream that serves the package wins,
     * and a 404 or unreachable upstream falls through to the next
     * upstream in the same rule, never to a later rule (a broader rule
     * as fallback would leak private package names to its upstreams).
     * The last rule must be the match-all rule
     * (`{ pattern: '**', ... }`) so every package has a route; a rule
     * placed after a match-all could never apply and is rejected.
     * Changing this configuration invalidates the runner's dependency
     * cache.
     *
     * `defineConfig` type-checks that every upstream name used in
     * `packages` is defined under `upstreams`; define the registries
     * object inline in the config literal, since the check relies on
     * type inference from the `upstreams` keys. The same rules are also
     * enforced at config load for plain-JS configs.
     */
    registries?: Registries<UpstreamName>
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
    validateRunner(config)

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

function validateRunner (config: ChecklyConfig): void {
  const { runner } = config
  if (runner === undefined) {
    return
  }

  // Same rationale as `validateBundle`: plain-JS configs bypass the
  // TypeScript type, and a misshapen `runner` block would otherwise read as
  // `registries: undefined` and silently disable routing, surfacing only as
  // an install failure on the runner.
  if (runner === null || typeof runner !== 'object' || Array.isArray(runner)) {
    throw new Error(`Config field 'runner' must be an object if set`)
  }

  // A misspelled key (`registires`) would silently disable routing the same
  // way a misshapen block would.
  for (const key of Object.keys(runner)) {
    if (key !== 'registries') {
      throw new Error(`Config field 'runner' contains unknown field '${key}' (expected only: 'registries')`)
    }
  }

  const { registries } = runner
  if (registries === undefined) {
    return
  }

  try {
    validateRegistries(registries)
  } catch (cause) {
    throw new Error(`Config field 'runner.registries' is invalid: ${(cause as Error).message}`, { cause })
  }
}
