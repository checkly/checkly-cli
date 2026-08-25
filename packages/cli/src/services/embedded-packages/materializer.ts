import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import axios from 'axios'
import Debug from 'debug'
import PQueue from 'p-queue'

import { assignProxy } from '../proxy.js'
import { TarballCache, lookupNpmCacache } from './cache.js'
import {
  RedirectOutcome,
  SentCredentials,
  UrlOrigin,
  downloadFailureHint,
  capList,
  describeConfigKeys,
  describeUnreadableConfig,
  describeUnusableUrlOrigin,
  RecordedUrlOrigin,
  redactUrl,
} from './diagnostics.js'
import { verifyIntegrity } from './integrity.js'
import {
  LockfileRegistryPackage,
  UnsupportedLockfileError,
  isPnpmLockfile,
  loadLockfilePackages,
} from './lockfile-packages.js'
import {
  LoadedNpmrcConfig,
  defaultNpmrcPaths,
  loadNpmrcConfig,
  pnpmAuthIniPath,
  ResolvedAuth,
  resolveAuthHeader,
  UsableRegistry,
  resolveRegistry,
} from './npmrc.js'
import {
  EmbeddedPackageSpec,
  InvalidEmbeddedPackageSpecError,
  PackageRef,
  parseEmbeddedPackageSpec,
  specLooselyMatchesPackage,
  specMatchesPackage,
  specMatchesPackageName,
} from './spec.js'
import { COMPOSABLE_URL_REQUIREMENT, parseFetchableUrl } from './url.js'

const debug = Debug('checkly:cli:services:embedded-packages')

/**
 * The directory inside the code bundle where embedded package tarballs
 * live. This path is a contract with Checkly runners: tarballs found there
 * are served through a local registry during the bundle's install step.
 */
export const EMBEDDED_PACKAGES_ARCHIVE_DIR = '.checkly/embedded-packages'

export interface EmbeddedPackagesIssue {
  type: 'invalid-spec' | 'missing-lockfile' | 'unsupported-lockfile'
    | 'spec-not-found' | 'spec-version-not-found' | 'spec-not-embeddable'
  /** The offending `bundle.packages.embed` entry, when tied to one. */
  spec?: string
  /** Standalone sentence describing the issue, usable on its own. */
  message: string
  /**
   * Entry-scoped detail for grouped diagnostics, phrased to follow the
   * entry under a per-type heading — e.g. the versions the lockfile does
   * have, or the reasons the matches cannot be embedded.
   */
  detail?: string
}

/**
 * One tarball selected for embedding, resolved from the lockfile.
 */
export interface PlannedTarball extends LockfileRegistryPackage {
  /** Archive filename, e.g. `@acme+foo@1.2.3.tgz` (scope slash → `+`). */
  archiveFilename: string
}

export interface EmbeddedPackagesPlan {
  tarballs: PlannedTarball[]
  issues: EmbeddedPackagesIssue[]
  /**
   * Non-fatal problems worth surfacing (e.g. a spec also matching
   * dependencies that cannot be embedded). Reported through the
   * diagnostics channel during project validation.
   */
  warnings: string[]
  /**
   * The lockfile the specs were resolved against, for diagnostics that
   * name it once instead of once per issue. Absent when resolution never
   * happened — no lockfile found, or an unsupported/unparsable one (the
   * corresponding lockfile issue explains it).
   */
  lockfilePath?: string
}

/**
 * A planned tarball that has been sourced into the CLI cache and is ready
 * to be added to the code bundle.
 */
export interface MaterializedTarball extends PlannedTarball {
  /**
   * SRI integrity the tarball was verified against — the lockfile's, or for
   * yarn.lock plans the one resolved from registry metadata.
   */
  integrity: string
  /** Absolute path of the verified tarball in the CLI cache. */
  filePath: string
  /** Bundle-root-relative archive path (POSIX). */
  archivePath: string
}

export class EmbeddedPackageError extends Error {
  constructor (message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EmbeddedPackageError'
  }
}

export interface EmbeddedPackagesMaterializerOptions {
  /** Raw `bundle.packages.embed` entries. */
  specs: string[]
  /** Absolute path of the workspace root lockfile, when one exists. */
  lockfilePath?: string
  /** Workspace root directory, used to locate the root `.npmrc`. */
  workspaceRoot?: string
  /**
   * The directory the Checkly project lives in (a workspace member in a
   * monorepo), whose `.npmrc` takes precedence over the workspace root's.
   */
  contextDir?: string
  env?: NodeJS.ProcessEnv
  homedir?: string
}

const DOWNLOAD_CONCURRENCY = 5
const DOWNLOAD_TIMEOUT_MS = 120_000
const MAX_TARBALL_BYTES = 1024 * 1024 * 1024

/**
 * Wraps an axios error from a registry request in an EmbeddedPackageError,
 * appending the HTTP status and whatever the caller's hint makes of it.
 * `message` is the action-specific prefix (e.g. "Failed to download …").
 */
function registryHttpError (
  err: any,
  message: string,
  hint: (status: number | undefined) => string = () => '',
): EmbeddedPackageError {
  const status = err?.response?.status
  const statusHint = status !== undefined ? ` (HTTP ${status})` : ''
  return new EmbeddedPackageError(`${message}${statusHint}.${hint(status)}`, { cause: err })
}

/**
 * Whether a URL carries credentials in its userinfo component. axios sends
 * those itself — and drops any `Authorization` header when it does — so a
 * failure hint that only consulted the npm config would contradict what was
 * actually on the wire.
 *
 * Only called with a URL the caller has already parsed successfully.
 */
function hasUrlCredentials (url: string): boolean {
  const parsed = new URL(url)
  return parsed.username !== '' || parsed.password !== ''
}

/**
 * Resolves the configured `bundle.packages.embed` specs against the
 * workspace lockfile (plan) and sources the selected tarballs into the CLI
 * cache (materializeTarballs), through a chain of CLI cache → npm cacache →
 * registry download, always verified against the lockfile integrity.
 *
 * The plan memoizes its in-flight promise: validation and bundling share
 * one instance per parsed project, so the (purely local) resolution runs
 * exactly once. Materialization has a single caller — the Bundler, at
 * finalize time, after the bundled lockfile has been pruned — which passes
 * the subset of the plan the shipped lockfile still references, so
 * pruned-away tarballs are never downloaded.
 */
export class EmbeddedPackagesMaterializer {
  #options: EmbeddedPackagesMaterializerOptions
  #cache: TarballCache
  #env: NodeJS.ProcessEnv
  #homedir: string

  #plan?: Promise<EmbeddedPackagesPlan>

  constructor (options: EmbeddedPackagesMaterializerOptions) {
    this.#options = options
    this.#env = options.env ?? process.env
    this.#homedir = options.homedir ?? os.homedir()
    this.#cache = TarballCache.default(this.#env, this.#projectRoot, process.platform, this.#homedir)
  }

  get #projectRoot (): string | undefined {
    const { workspaceRoot, lockfilePath } = this.#options
    return workspaceRoot ?? (lockfilePath !== undefined ? path.dirname(lockfilePath) : undefined)
  }

  plan (): Promise<EmbeddedPackagesPlan> {
    this.#plan ??= this.#createPlan()
    return this.#plan
  }

  /**
   * Sources the given subset of the planned tarballs (CLI cache → npm
   * cacache → registry download, verified against the lockfile integrity).
   * Lets the caller materialize only the tarballs a pruned bundled lockfile
   * still references, so pruned-away packages are never downloaded.
   */
  async materializeTarballs (tarballs: PlannedTarball[]): Promise<MaterializedTarball[]> {
    const { issues } = await this.plan()

    // Commands validate before bundling and exit on fatal diagnostics, so
    // this is a defensive backstop for direct/programmatic use. Checked
    // before the empty-list short-circuit: an invalid configuration must
    // not pass silently just because nothing was requested.
    if (issues.length > 0) {
      throw new EmbeddedPackageError(
        `Cannot embed packages due to configuration issues:\n\n`
        + issues.map(issue => `  ${issue.message}`).join('\n'),
      )
    }

    if (tarballs.length === 0) {
      return []
    }

    // Safe to assert both: a missing lockfile is a plan issue, and issues
    // abort above.
    const lockfilePath = this.#options.lockfilePath!
    const pnpmAuthFile = pnpmAuthIniPath(this.#env, process.platform, this.#homedir)
    const pnpmAuthFilePreferred = isPnpmLockfile(lockfilePath)
    debug('pnpm auth file %s (preferred: %s)', pnpmAuthFile, pnpmAuthFilePreferred)

    const npmrc = await loadNpmrcConfig(defaultNpmrcPaths({
      workspaceRoot: this.#projectRoot!,
      homedir: this.#homedir,
      contextDir: this.#options.contextDir,
      pnpmAuthFile,
      pnpmAuthFilePreferred,
    }), this.#env)

    const queue = new PQueue({ concurrency: DOWNLOAD_CONCURRENCY })
    return await queue.addAll(tarballs.map(tarball => async (): Promise<MaterializedTarball> => {
      const { filePath, integrity } = await this.#obtainTarball(tarball, npmrc)
      return {
        ...tarball,
        integrity,
        filePath,
        archivePath: `${EMBEDDED_PACKAGES_ARCHIVE_DIR}/${tarball.archiveFilename}`,
      }
    }))
  }

  async #createPlan (): Promise<EmbeddedPackagesPlan> {
    const issues: EmbeddedPackagesIssue[] = []
    const warnings: string[] = []

    const specs: EmbeddedPackageSpec[] = []
    for (const raw of this.#options.specs) {
      try {
        specs.push(parseEmbeddedPackageSpec(raw))
      } catch (err) {
        issues.push({
          type: 'invalid-spec',
          spec: String(raw),
          message: (err as Error).message,
          detail: err instanceof InvalidEmbeddedPackageSpecError ? err.reason : (err as Error).message,
        })
      }
    }

    const { lockfilePath } = this.#options
    if (lockfilePath === undefined) {
      issues.push({
        type: 'missing-lockfile',
        message: `Embedded packages require a lockfile to resolve package versions and`
          + ` integrity hashes, but no lockfile was found for the project.`,
      })
      return { tarballs: [], issues, warnings }
    }

    let packages
    try {
      packages = await loadLockfilePackages(lockfilePath)
    } catch (err) {
      // Any failure to read or parse the lockfile (missing file, merge
      // conflict markers, unknown format) becomes a diagnostic naming the
      // lockfile instead of an unhandled exception aborting the command.
      const message = err instanceof UnsupportedLockfileError
        ? err.message
        : `Failed to read or parse the lockfile ('${lockfilePath}'): ${(err as Error).message}`
      // No lockfilePath in the result: the specs were never resolved
      // against the lockfile, so diagnostics must not credit it.
      issues.push({ type: 'unsupported-lockfile', message })
      return { tarballs: [], issues, warnings }
    }

    debug(
      'lockfile %s: %d registry entries, %d excluded entries',
      lockfilePath, packages.registry.length, packages.excluded.length,
    )

    // Excluded entries that share a name@version with a proper registry
    // entry are shadowed duplicates (npm nests integrity-less bundled
    // copies): the artifact IS embeddable through its registry entry, so
    // they must not trigger not-embeddable errors or skip warnings.
    const registryKeys = new Set(packages.registry.map(entry => `${entry.name}@${entry.version}`))
    const relevantExcluded = packages.excluded.filter(entry =>
      entry.version === undefined || !registryKeys.has(`${entry.name}@${entry.version}`))

    const tarballs = new Map<string, PlannedTarball>()
    for (const [index, spec] of specs.entries()) {
      // Exclusions select nothing themselves; they subtract from the entries
      // before them, via the kept() filter below. One that removes nothing is
      // a valid no-op rather than an error, unlike an unresolvable inclusion.
      if (spec.exclude) {
        // Matching nothing is a valid outcome, so a misspelled `!` entry
        // cannot be an error — but it silently fails to keep a package out,
        // which is worth a line on the debug channel.
        if (!packages.registry.some(entry => specMatchesPackageName(spec, entry.name))
          && !relevantExcluded.some(entry => specMatchesPackageName(spec, entry.name))) {
          debug('exclusion %s matches no package in the lockfile', spec.raw)
        }
        continue
      }

      // Entries apply in order, so only the `!` entries that come after this
      // one take anything away from it. Filtering the matches up front,
      // rather than pruning the finished plan, keeps the diagnostics below in
      // step with what actually ships: an entry never warns about, or fails
      // over, a package the configuration goes on to exclude.
      const laterExclusions = specs.slice(index + 1).filter(other => other.exclude)
      const kept = <T extends PackageRef>(entries: T[]) =>
        entries.filter(entry => !laterExclusions.some(other => specMatchesPackage(other, entry)))

      // nameMatches stays unfiltered: it only feeds the diagnostics below,
      // which describe the lockfile as it is — a mistyped pin should still be
      // told which versions exist, even when an unrelated exclusion removed
      // them from what this entry embeds.
      const nameMatches = packages.registry.filter(entry => specMatchesPackageName(spec, entry.name))
      const allCandidates = packages.registry.filter(entry => specMatchesPackage(spec, entry))
      // The two sets differ only in version-less entries (workspace links,
      // git resolutions), which the loose one keeps: such an entry matches
      // any pin, so it can describe a pinned spec's failure but must not be
      // what silences it. Both feed the diagnostics below, at different
      // rungs of the ladder.
      const allLooseExcluded = relevantExcluded.filter(entry => specLooselyMatchesPackage(spec, entry))
      const allStrictExcluded = relevantExcluded.filter(entry => specMatchesPackage(spec, entry))

      const candidates = kept(allCandidates)
      const looseExcluded = kept(allLooseExcluded)
      const strictExcluded = kept(allStrictExcluded)

      // Everything this entry could have embedded was removed by a later `!`
      // entry, which is the configured outcome: it embeds nothing and reports
      // nothing instead of looking unresolvable. Two ways to get there, and
      // both require the exclusions to be the whole reason: an entry that had
      // embeddable matches is silent once every one of them is excluded, and
      // an entry that only ever reached un-embeddable matches is silent only
      // once every one of *those* is excluded — one that survives still
      // carries the not-embeddable error it would raise on its own.
      //
      // Comparing at the version-filtered level matters: an entry disabled by
      // appending its own pin as an exclusion ('bar@2.0.0', '!bar@2.0.0')
      // would otherwise stay alive on the package's other versions and fail
      // with a version-not-found error that names them as the only ones in
      // the lockfile.
      //
      // An entry emptied this way also drops the skip warning for any
      // un-embeddable package it reached but did not exclude. That is a
      // deliberate trade: keeping the warning means keeping the entry alive
      // past this point, where an un-embeddable match with nothing left to
      // embed alongside it is a fatal error. The debug line below is what
      // explains an entry that embedded nothing.
      if (candidates.length === 0
        && (allCandidates.length > 0
          || (allStrictExcluded.length > 0 && strictExcluded.length === 0))) {
        debug('spec %s: embeds nothing, later exclusions removed every embeddable match (reached: %j)',
          spec.raw, [...allCandidates, ...allStrictExcluded].map(entry => `${entry.name}@${entry.version}`))
        continue
      }

      if (candidates.length === 0) {
        // Excluded entries matching the exact pin (or any entry, when
        // unpinned) carry the most actionable reason and win; a version
        // pin that filtered out real registry matches is blamed next.
        // Version-less excluded entries (e.g. workspace links) are a last
        // resort, so a pinned spec is never blamed on one while a better
        // explanation exists.
        // The fallback reads the unfiltered set, for the same reason
        // nameMatches is unfiltered: an entry that still has to fail should
        // fail with the most accurate reason the lockfile offers, and a
        // version-less excluded entry (a git resolution, a workspace link)
        // is often the only thing that explains it.
        const excludedMatches = strictExcluded.length > 0
          ? strictExcluded
          : nameMatches.length === 0 ? allLooseExcluded : []
        if (excludedMatches.length > 0) {
          const reasons = capList([...new Set(excludedMatches.map(entry => entry.reason))], '; ', '; and ')
          issues.push({
            type: 'spec-not-embeddable',
            spec: spec.raw,
            message: `Embedded package '${spec.raw}' cannot be embedded: ${reasons}.`,
            detail: reasons,
          })
        } else if (nameMatches.length > 0) {
          const versions = capList([...new Set(nameMatches.map(entry => entry.version))], ', ', ' and ')
          issues.push({
            type: 'spec-version-not-found',
            spec: spec.raw,
            message: `Embedded package '${spec.raw}' matches package name(s) in the lockfile`
              + ` ('${lockfilePath}'), but none of them at version ${spec.version}`
              + ` (lockfile has: ${versions}).`,
            detail: `lockfile has: ${versions}`,
          })
        } else {
          const hint = spec.wildcard
            ? `pattern matches its name${spec.version !== undefined ? ' and the version is spelled correctly' : ''}`
            : `name ${spec.version !== undefined ? 'and version are' : 'is'} spelled correctly`
          issues.push({
            type: 'spec-not-found',
            spec: spec.raw,
            message: `Embedded package '${spec.raw}' does not match any package in the lockfile`
              + ` ('${lockfilePath}'). Make sure the package is installed and the ${hint}.`,
          })
        }
        continue
      }

      // When the spec also reaches entries it cannot embed, that is not
      // the hard error a fully-unresolvable spec gets. Workspace members
      // (part of the project itself) are skipped silently; git/file/URL
      // and integrity-less matches cannot be embedded but may still be
      // needed at install time, so skipping them is said out loud.
      const workspace = looseExcluded.filter(entry => entry.kind === 'workspace')
      if (workspace.length > 0) {
        debug('spec %s: %d workspace matches skipped: %j',
          spec.raw, workspace.length, workspace.map(entry => entry.name))
      }
      const unfetchable = looseExcluded.filter(entry => entry.kind === 'unfetchable')
      if (unfetchable.length > 0) {
        const names = [...new Set(unfetchable.map(entry => entry.name))]
        warnings.push(
          `Embedded package '${spec.raw}' also matches ${names.length} package(s) that cannot`
          + ` be embedded as registry tarballs and were skipped: ${capList(names, ', ', ' and ')}.`
          + ` The runner must be able to fetch these itself.`,
        )
      }
      if (spec.wildcard) {
        // Wildcards select invisibly, but only the debug log says what they
        // selected. Selections that need attention surface louder: a
        // pattern matching nothing is a fatal validation issue, and matches
        // that cannot be embedded produce a warning diagnostic.
        debug('pattern %s matched %d package(s): %j',
          spec.raw, candidates.length, candidates.map(entry => `${entry.name}@${entry.version}`))
      }

      for (const entry of candidates) {
        tarballs.set(`${entry.name}@${entry.version}`, {
          ...entry,
          archiveFilename: `${entry.name.replace(/\//g, '+')}@${entry.version}.tgz`,
        })
      }
    }

    // Without exclusions every entry either embeds something or raises an
    // issue, so an empty plan with nothing to report can only come from `!`
    // entries — most likely a config that reads them as gitignore's implicit
    // "everything except" rather than as a subtraction from what came
    // before. Embedding nothing is not an error, but saying so beats letting
    // the user find out from an install failure on the runner.
    if (specs.length > 0 && tarballs.size === 0 && issues.length === 0) {
      warnings.push(
        `No packages matched 'bundle.packages.embed', so nothing will be embedded into the code bundle.`
        + ` An exclusion entry ('!...') only removes packages that the entries before it selected.`,
      )
    }

    debug('plan: %d tarballs, %d issues, %d warnings', tarballs.size, issues.length, warnings.length)

    return {
      tarballs: [...tarballs.values()].sort((a, b) => a.archiveFilename.localeCompare(b.archiveFilename)),
      issues,
      warnings,
      lockfilePath,
    }
  }

  /**
   * Resolves the registry a package comes from, refusing one nothing can be
   * fetched from.
   *
   * The registry URL is checked before anything is composed onto it:
   * `registry=https://` composes into `https://<package name>/...`, which
   * parses cleanly with the package name as its HOST, so the request would
   * go to whatever host bears that name. A query or fragment is refused for
   * the mirror-image reason — it absorbs the path instead of the host.
   */
  #resolveFetchableRegistry (
    tarball: PlannedTarball,
    npmrc: LoadedNpmrcConfig,
  ): UsableRegistry {
    const registry = resolveRegistry(npmrc.config, tarball.name, this.#env)
    if (registry.usable) {
      return registry
    }

    // One sentence covering every way it can fail — it parses or it does
    // not, it has a host or it does not, its scheme is fetchable or it is
    // not, it carries a query or it does not — because splitting them
    // produced advice that was wrong for the case it did not cover:
    // `file:///srv/mirror/` is absolute and has a protocol, and being told
    // to add one sends the reader nowhere.
    //
    // The value is not echoed, for the same reason a composed URL is not:
    // one this malformed could carry a credential anywhere in it.
    throw new EmbeddedPackageError(
      `The registry URL for embedded package '${tarball.name}@${tarball.version}' is not usable:`
      + ` it must be ${COMPOSABLE_URL_REQUIREMENT}.`
      + ` It is configured by ${describeConfigKeys([registry.key], npmrc)}.`,
    )
  }

  /**
   * Rejects a tarball URL nothing can be fetched from, naming whoever
   * handed it over. Only a URL this CLI did not compose can get here — see
   * `RecordedUrlOrigin`.
   *
   * The offending value is deliberately not echoed: it is unusable by
   * definition here, so nothing can reliably tell a credential in it from a
   * path. Naming the source is both safe and more useful — that is where
   * the reader goes to fix it.
   */
  #assertFetchableTarballUrl (
    url: string,
    tarball: PlannedTarball,
    npmrc: LoadedNpmrcConfig,
    origin: RecordedUrlOrigin,
  ): void {
    if (parseFetchableUrl(url) !== undefined) {
      return
    }

    throw new EmbeddedPackageError(
      `The tarball URL for embedded package '${tarball.name}@${tarball.version}'`
      + ` is not a valid URL. ${describeUnusableUrlOrigin(origin, npmrc)}`,
    )
  }

  async #obtainTarball (
    tarball: PlannedTarball,
    npmrc: LoadedNpmrcConfig,
  ): Promise<{ filePath: string, integrity: string }> {
    let { integrity, tarballUrl } = tarball
    // Set when the URL below came from package metadata rather than the
    // lockfile, so a failure blames the registry that served it instead of
    // a lockfile that never mentioned it.
    let metadataOrigin: RecordedUrlOrigin | undefined
    if (integrity === undefined) {
      // yarn.lock plans carry no SRI tarball integrity (Berry checksums
      // hash yarn's own cache archive); resolve it from the registry's
      // per-version metadata before the caches can be consulted.
      const dist = await this.#resolveDistFromRegistry(tarball, npmrc)
      integrity = dist.integrity
      if (tarballUrl === undefined && dist.tarballUrl !== undefined) {
        tarballUrl = dist.tarballUrl
        metadataOrigin = { metadata: { registryKey: dist.registryKey } }
      }
    }

    const cached = await this.#cache.get(integrity)
    if (cached !== undefined) {
      debug('%s@%s: CLI cache hit', tarball.name, tarball.version)
      return { filePath: cached, integrity }
    }

    const fromNpmCacache = await lookupNpmCacache(integrity, this.#env, process.platform, this.#homedir)
    if (fromNpmCacache !== undefined) {
      debug('%s@%s: npm cache hit', tarball.name, tarball.version)
      return { filePath: await this.#cache.put(integrity, fromNpmCacache), integrity }
    }

    // Where the URL came from decides who to blame for credentials embedded
    // in it: a lockfile-recorded URL is the lockfile's, a derived one
    // belongs to whichever config key configured the registry.
    let url: string
    let urlOrigin: UrlOrigin
    if (tarballUrl !== undefined) {
      url = tarballUrl
      // Safe to assert: a missing lockfile is a plan issue, and materialize
      // aborts on issues before any tarball is obtained.
      const recorded = metadataOrigin ?? { lockfile: this.#options.lockfilePath! }
      // Only a URL handed over already formed can be unusable: the one the
      // else-branch composes is built on a registry checked beforehand.
      this.#assertFetchableTarballUrl(url, tarball, npmrc, recorded)
      urlOrigin = recorded
    } else {
      const registry = this.#resolveFetchableRegistry(tarball, npmrc)
      const basename = tarball.name.split('/').pop()
      url = `${registry.url}${tarball.name}/-/${basename}-${tarball.version}.tgz`
      urlOrigin = { registryKey: registry.key }
    }

    debug('%s@%s: downloading from %s', tarball.name, tarball.version, redactUrl(url))
    const content = await this.#download(tarball, url, npmrc, urlOrigin)

    if (!verifyIntegrity(content, integrity)) {
      // For yarn.lock plans the integrity came from the registry's own
      // metadata, not the lockfile, so name the right source to check.
      const source = tarball.integrity === undefined
        ? `the integrity hash the registry's metadata reported`
        : `the integrity hash recorded in the lockfile`
      throw new EmbeddedPackageError(
        `The tarball downloaded for embedded package '${tarball.name}@${tarball.version}'`
        + ` from '${redactUrl(url)}' does not match ${source}`
        + ` ('${integrity}'). The registry may be serving a different artifact`
        + ` than the one the lockfile was created against.`,
      )
    }

    return { filePath: await this.#cache.put(integrity, content), integrity }
  }

  /**
   * Resolves the npm tarball integrity (and canonical tarball URL) for a
   * package whose lockfile cannot provide one. Tries the abbreviated
   * per-version metadata route (`GET <registry>/<name>/<version>`) first,
   * then falls back to the full packument (`GET <registry>/<name>`, whose
   * `versions[version].dist` carries the same fields) — some private
   * registry proxies serve only one of the two. The scope slash stays
   * unencoded, matching npm's own use of these routes. The requests use
   * the same registry resolution and credentials as the tarball download
   * itself, so they add no trust beyond the download; the end-to-end
   * content pin still holds because the package manager re-verifies its
   * own lockfile checksums against the served content at install time.
   */
  async #resolveDistFromRegistry (
    tarball: PlannedTarball,
    npmrc: LoadedNpmrcConfig,
  ): Promise<{ integrity: string, tarballUrl?: string, registryKey?: string }> {
    // Both routes are this URL plus the package name, so checking it covers
    // them and the composed forms need no guard of their own.
    const registry = this.#resolveFetchableRegistry(tarball, npmrc)
    const versionUrl = `${registry.url}${tarball.name}/${tarball.version}`
    const packumentUrl = `${registry.url}${tarball.name}`

    // Per-version route: dist is at the document root.
    const perVersion = await this.#fetchMetadataDist(
      tarball, npmrc, versionUrl, registry.key, data => data?.dist,
    )
    // Packument fallback (only when the per-version route yielded no dist,
    // whether it 404'd or answered without one): dist is nested per version.
    const packument = perVersion?.dist !== undefined
      ? undefined
      : await this.#fetchMetadataDist(
          tarball, npmrc, packumentUrl, registry.key, data => data?.versions?.[tarball.version]?.dist,
        )
    const dist = perVersion?.dist ?? packument?.dist

    if (dist === undefined) {
      // Distinguish "the registry has nothing for us" from "it answered but
      // this version is not in it": only the first can be an authorization
      // failure, since a private registry hides packages the caller may not
      // see behind a 404, and claiming so for the second sends the reader to
      // rotate a token the registry just accepted.
      const answered = perVersion !== undefined || packument !== undefined
      if (answered) {
        throw new EmbeddedPackageError(
          `The registry metadata at '${redactUrl(versionUrl)}' does not describe embedded package`
          + ` '${tarball.name}@${tarball.version}', so its integrity could not be resolved.`
          + ` The version may have been unpublished, the registry may serve only some versions, or`
          + ` something in front of it — a proxy or an SSO gateway — may have answered instead of`
          + ` the registry.${describeUnreadableConfig(npmrc)}`,
        )
      }

      const auth = resolveAuthHeader(npmrc.config, versionUrl, tarball.name, this.#env)
      const sent = this.#sentCredentials(versionUrl, { registryKey: registry.key }, auth)
      throw new EmbeddedPackageError(
        `The registry at '${redactUrl(versionUrl)}' has no metadata for embedded package`
        + ` '${tarball.name}@${tarball.version}', so its integrity could not be resolved.`
        + downloadFailureHint(404, sent, npmrc),
      )
    }

    // Modern publishes carry an SRI `integrity`; very old ones only a hex
    // sha1 `shasum`, which converts to a (weaker but supported) SRI hash.
    const integrity = typeof dist.integrity === 'string' && dist.integrity !== ''
      ? dist.integrity as string
      : typeof dist.shasum === 'string' && /^[0-9a-f]{40}$/.test(dist.shasum)
        ? `sha1-${Buffer.from(dist.shasum, 'hex').toString('base64')}`
        : undefined
    if (integrity === undefined) {
      throw new EmbeddedPackageError(
        `The registry metadata for embedded package '${tarball.name}@${tarball.version}'`
        + ` (from '${redactUrl(versionUrl)}') provides no usable integrity hash, so the`
        + ` downloaded tarball could not be verified.`,
      )
    }

    return {
      integrity,
      registryKey: registry.key,
      // The same cheap prefilter the lockfile readers apply, and no more:
      // anything that survives it is checked properly by
      // `#assertFetchableTarballUrl`, which reports a URL the registry
      // returned rather than silently composing a different one.
      tarballUrl: typeof dist.tarball === 'string' && /^https?:/.test(dist.tarball)
        ? dist.tarball as string
        : undefined,
    }
  }

  /**
   * Who supplied the credentials on a request, for the failure message.
   *
   * Userinfo embedded in the URL wins: axios sends that itself and drops
   * the Authorization header when it does, so naming the config entry
   * would name credentials that never reached the wire. A URL with no
   * userinfo falls back to the config keys — including one derived from the
   * default registry, whose URL carries none by construction.
   */
  #sentCredentials (
    url: string,
    origin: UrlOrigin,
    auth: ResolvedAuth | undefined,
  ): SentCredentials | undefined {
    if (hasUrlCredentials(url)) {
      return { from: 'url', origin }
    }
    return auth !== undefined ? { from: 'config', keys: auth.keys } : undefined
  }

  /**
   * Fetches one metadata URL and extracts its `dist` via `select`.
   *
   * Returns undefined on a 404 — distinct from `{ dist: undefined }`, which
   * means the route answered but carried nothing usable. The caller needs
   * both apart: only a route that never answered can be an authorization
   * failure. Any other failure — auth, network, malformed response — throws,
   * because retrying a different route would only mask it.
   */
  async #fetchMetadataDist (
    tarball: PlannedTarball,
    npmrc: LoadedNpmrcConfig,
    url: string,
    registryKey: string | undefined,
    select: (data: any) => any,
  ): Promise<{ dist: any } | undefined> {
    const auth = resolveAuthHeader(npmrc.config, url, tarball.name, this.#env)
    // This URL is always one the CLI built from the registry.
    const sent = this.#sentCredentials(url, { registryKey }, auth)
    debug('%s@%s: resolving integrity from %s', tarball.name, tarball.version, redactUrl(url))
    try {
      const response = await axios.get(url, assignProxy(url, {
        headers: {
          ...(auth !== undefined ? { authorization: auth.header } : {}),
        },
        timeout: DOWNLOAD_TIMEOUT_MS,
      }))
      return { dist: select(response.data) ?? undefined }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return undefined
      }
      throw registryHttpError(
        err,
        `Failed to fetch registry metadata for embedded package`
        + ` '${tarball.name}@${tarball.version}' from '${redactUrl(url)}'`,
        status => downloadFailureHint(status, sent, npmrc),
      )
    }
  }

  async #download (
    tarball: PlannedTarball,
    url: string,
    npmrc: LoadedNpmrcConfig,
    urlOrigin: UrlOrigin,
  ): Promise<Buffer> {
    const auth = resolveAuthHeader(npmrc.config, url, tarball.name, this.#env)

    const sent = this.#sentCredentials(url, urlOrigin, auth)

    // A redirect can make the credentials moot: follow-redirects drops
    // confidential headers rather than hand them to another host, so
    // whatever answered never saw them and "they were rejected" would be
    // wrong. Tarball downloads redirect to CDNs routinely.
    //
    // Observed, not predicted: the drop happens before `beforeRedirect`
    // runs and mutates the very options handed to it, so the hook can see
    // what actually survived. Re-deriving the library's rule would get
    // subdomain redirects (which keep the header) and protocol downgrades
    // (which drop it regardless of host) wrong, and would rot silently if
    // the policy ever changed.
    //
    // The hop itself is recorded even when nothing was sent: whatever
    // answered is then not the host the reader configured, and telling them
    // to add credentials for a host that never asked is its own dead end.
    const redirect: RedirectOutcome = {}

    try {
      const response = await axios.get<ArrayBuffer>(url, assignProxy(url, {
        responseType: 'arraybuffer',
        headers: {
          // Ask for the raw artifact: a registry or proxy that labels the
          // already-gzipped tarball with `Content-Encoding: gzip` would
          // otherwise make axios gunzip it, breaking integrity verification
          // with a misleading "different artifact" error.
          'accept-encoding': 'identity',
          ...(auth !== undefined ? { authorization: auth.header } : {}),
        },
        beforeRedirect: (options: { host?: string, auth?: string | null, headers?: Record<string, unknown> }) => {
          redirect.host = options.host
          if (sent === undefined) {
            return
          }
          const keptHeader = Object.keys(options.headers ?? {})
            .some(header => header.toLowerCase() === 'authorization')
          // `!= null` rather than `!== undefined`: the legacy URL path
          // yields `null` here, and treating that as "credentials survived"
          // would fail open on the very check meant to catch a drop.
          const keptUrlAuth = options.auth != null && options.auth !== ''
          // Assigned rather than latched: a later hop back to the original
          // origin restores URL credentials, and reporting them as dropped
          // would send the reader to inspect the wrong host.
          redirect.credentialsDropped = !keptHeader && !keptUrlAuth
        },
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxContentLength: MAX_TARBALL_BYTES,
      }))
      return Buffer.from(response.data)
    } catch (err: any) {
      throw registryHttpError(
        err,
        `Failed to download embedded package '${tarball.name}@${tarball.version}'`
        + ` from '${redactUrl(url)}'`,
        status => downloadFailureHint(status, sent, npmrc, redirect),
      )
    }
  }
}
