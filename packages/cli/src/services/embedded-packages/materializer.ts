import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import axios from 'axios'
import Debug from 'debug'
import PQueue from 'p-queue'

import { assignProxy } from '../proxy.js'
import { TarballCache, lookupNpmCacache } from './cache.js'
import { DetectionCache, detectionInputDigest, verdictKey } from './detection-cache.js'
import {
  DetectionUnavailableError,
  DetectionVerdict,
  NexusRegistryApi,
  PropagationContext,
  classifyEntries,
  decideWithHostedInventory,
  diffAgainstPublicRegistry,
  graphKey,
  nexusContentBase,
  planPropagationRound,
  recordEmbedEvidence,
} from './detection.js'
import { verifyIntegrity } from './integrity.js'
import {
  LockfileDependencyGraph,
  LockfileRegistryPackage,
  UnsupportedLockfileError,
  loadLockfilePackages,
} from './lockfile-packages.js'
import { NpmrcConfig, defaultNpmrcPaths, loadNpmrcConfig, resolveAuthHeader, resolveRegistryUrl } from './npmrc.js'
import { EmbeddedPackageSpec, parseEmbeddedPackageSpec, specMatchesPackageName } from './spec.js'

const debug = Debug('checkly:cli:services:embedded-packages')

/**
 * The directory inside the code bundle where embedded package tarballs
 * live. This path is a contract with Checkly runners: tarballs found there
 * are served through a local registry during the bundle's install step.
 */
export const EMBEDDED_PACKAGES_ARCHIVE_DIR = '.checkly/embedded-packages'

export interface EmbeddedPackagesIssue {
  type: 'invalid-spec' | 'missing-lockfile' | 'unsupported-lockfile' | 'spec-not-found' | 'spec-not-embeddable'
  /** The offending `checks.embeddedPackages` entry, when tied to one. */
  spec?: string
  message: string
}

/**
 * One tarball selected for embedding, resolved from the lockfile.
 */
export interface PlannedTarball extends LockfileRegistryPackage {
  /** Archive filename, e.g. `@acme+foo@1.2.3.tgz` (scope slash → `+`). */
  archiveFilename: string
  /**
   * Present when auto-detection selected this tarball. Detected tarballs
   * fail soft: a download problem skips the tarball with a warning instead
   * of aborting the run, unlike explicitly configured ones.
   */
  detected?: true
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
  /** What each wildcard spec resolved to, announced during bundling. */
  wildcardMatches: Array<{ spec: string, packages: string[] }>
}

/**
 * A planned tarball that has been sourced into the CLI cache and is ready
 * to be added to the code bundle.
 */
export interface MaterializedTarball extends PlannedTarball {
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
  /** Raw `checks.embeddedPackages` entries. */
  specs: string[]
  /**
   * Whether to auto-detect packages to embed from the lockfile in addition
   * to the explicit specs. Detected entries never override an explicitly
   * configured name (per-name precedence).
   */
  detect?: boolean
  /**
   * What to do when detection cannot decide packages without querying the
   * public npm registry (which would transmit private package names).
   * `'skip'` (default) leaves them un-embedded with a warning;
   * `'public-registry'` opts into the integrity diff against public npm.
   */
  detectionFallback?: 'skip' | 'public-registry'
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
  /** Public registry base URL for detection; tests point this at a local server. */
  publicRegistryUrl?: string
}

const DOWNLOAD_CONCURRENCY = 5
const DOWNLOAD_TIMEOUT_MS = 120_000
const MAX_TARBALL_BYTES = 1024 * 1024 * 1024

// The skip reason for conservative same-origin entries the instance does
// not host.
const CONSERVATIVE_UNDETERMINED_REASON = `the packages' recorded source shares the configured registry's host but`
  + ` is not hosted on it, so their availability cannot be determined`

/**
 * Removes userinfo credentials from a URL so it can be safely included in
 * error messages and logs (a registry URL may embed a token).
 */
function redactUrl (url: string): string {
  try {
    const parsed = new URL(url)
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    // Not parseable as a URL (e.g. a scheme-less registry entry) — strip
    // anything that looks like a userinfo segment before displaying it.
    return url.replace(/(^|\/\/)[^/@\s]+@/, '$1')
  }
}

/** Per-run shared registry API state, keyed by REST base. */
interface InstanceState {
  repositories: Map<string, Promise<unknown[]>>
  inventories: Map<string, Promise<Set<string>>>
}

function getOrCreate<V> (map: Map<string, V>, key: string, create: () => V): V {
  let value = map.get(key)
  if (value === undefined) {
    value = create()
    map.set(key, value)
  }
  return value
}

function sameOrigin (a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/**
 * Resolves the configured `checks.embeddedPackages` specs against the
 * workspace lockfile (plan) and sources the selected tarballs into the CLI
 * cache (materialize), through a chain of CLI cache → npm cacache →
 * registry download, always verified against the lockfile integrity.
 *
 * Both stages memoize their in-flight promise: multiple Playwright checks
 * bundle concurrently, and validation and bundling share one instance per
 * parsed project, so the work runs exactly once.
 */
export class EmbeddedPackagesMaterializer {
  #options: EmbeddedPackagesMaterializerOptions
  #cache: TarballCache
  #detectionCache: DetectionCache
  #env: NodeJS.ProcessEnv
  #homedir: string

  #plan?: Promise<EmbeddedPackagesPlan>
  #materialized?: Promise<MaterializedTarball[]>
  #lockfile?: Promise<{ content: string, packages: Awaited<ReturnType<typeof loadLockfilePackages>> }>

  constructor (options: EmbeddedPackagesMaterializerOptions) {
    this.#options = options
    this.#env = options.env ?? process.env
    this.#homedir = options.homedir ?? os.homedir()
    this.#cache = TarballCache.default(this.#env, this.#projectRoot, process.platform, this.#homedir)
    this.#detectionCache = DetectionCache.default(this.#env, this.#projectRoot, process.platform, this.#homedir)
  }

  get #projectRoot (): string | undefined {
    const { workspaceRoot, lockfilePath } = this.#options
    return workspaceRoot ?? (lockfilePath !== undefined ? path.dirname(lockfilePath) : undefined)
  }

  plan (): Promise<EmbeddedPackagesPlan> {
    this.#plan ??= this.#createPlan()
    return this.#plan
  }

  #loadLockfile (lockfilePath: string) {
    this.#lockfile ??= (async () => {
      const content = await fs.readFile(lockfilePath, 'utf8')
      return { content, packages: await loadLockfilePackages(lockfilePath, content) }
    })()
    return this.#lockfile
  }

  materialize (): Promise<MaterializedTarball[]> {
    this.#materialized ??= this.#materializeAll()
    return this.#materialized
  }

  async #createPlan (): Promise<EmbeddedPackagesPlan> {
    // Without explicit specs there is nothing to validate: auto-detection
    // (when enabled) runs at materialize time and cannot produce spec
    // issues, and a project without a lockfile must not fail validation
    // just because detection is on by default.
    if (this.#options.specs.length === 0) {
      return { tarballs: [], issues: [], warnings: [], wildcardMatches: [] }
    }

    const issues: EmbeddedPackagesIssue[] = []
    const warnings: string[] = []
    const wildcardMatches: Array<{ spec: string, packages: string[] }> = []

    const specs: EmbeddedPackageSpec[] = []
    for (const raw of this.#options.specs) {
      try {
        specs.push(parseEmbeddedPackageSpec(raw))
      } catch (err) {
        issues.push({ type: 'invalid-spec', spec: String(raw), message: (err as Error).message })
      }
    }

    const { lockfilePath } = this.#options
    if (lockfilePath === undefined) {
      issues.push({
        type: 'missing-lockfile',
        message: `Embedded packages require a lockfile to resolve package versions and`
          + ` integrity hashes, but no lockfile was found for the project.`,
      })
      return { tarballs: [], issues, warnings, wildcardMatches }
    }

    let packages
    try {
      packages = (await this.#loadLockfile(lockfilePath)).packages
    } catch (err) {
      // Any failure to read or parse the lockfile (missing file, merge
      // conflict markers, unknown format) becomes a diagnostic naming the
      // lockfile instead of an unhandled exception aborting the command.
      const message = err instanceof UnsupportedLockfileError
        ? err.message
        : `Failed to read or parse the lockfile ('${lockfilePath}'): ${(err as Error).message}`
      issues.push({ type: 'unsupported-lockfile', message })
      return { tarballs: [], issues, warnings, wildcardMatches }
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
    for (const spec of specs) {
      const nameMatches = packages.registry.filter(entry => specMatchesPackageName(spec, entry.name))
      const candidates = nameMatches
        .filter(entry => spec.version === undefined || entry.version === spec.version)

      const nameExcluded = relevantExcluded.filter(entry => specMatchesPackageName(spec, entry.name))
      const looseExcluded = nameExcluded.filter(entry =>
        spec.version === undefined || entry.version === undefined || entry.version === spec.version)

      if (candidates.length === 0) {
        // Excluded entries matching the exact pin (or any entry, when
        // unpinned) carry the most actionable reason and win; a version
        // pin that filtered out real registry matches is blamed next.
        // Version-less excluded entries (e.g. workspace links) are a last
        // resort, so a pinned spec is never blamed on one while a better
        // explanation exists.
        const strictExcluded = nameExcluded.filter(entry =>
          spec.version === undefined || entry.version === spec.version)
        const excludedMatches = strictExcluded.length > 0
          ? strictExcluded
          : nameMatches.length === 0 ? looseExcluded : []
        if (excludedMatches.length > 0) {
          const reasons = [...new Set(excludedMatches.map(entry => entry.reason))]
          const shownReasons = reasons.slice(0, 8).join('; ')
          const moreReasons = reasons.length > 8 ? `; and ${reasons.length - 8} more` : ''
          issues.push({
            type: 'spec-not-embeddable',
            spec: spec.raw,
            message: `Embedded package '${spec.raw}' cannot be embedded: ${shownReasons}${moreReasons}.`,
          })
        } else if (nameMatches.length > 0) {
          issues.push({
            type: 'spec-not-found',
            spec: spec.raw,
            message: `Embedded package '${spec.raw}' matches package name(s) in the lockfile`
              + ` ('${lockfilePath}'), but none of them at version ${spec.version}.`,
          })
        } else {
          const hint = spec.namePattern !== undefined
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
        const shown = names.slice(0, 8).join(', ')
        const more = names.length > 8 ? ` and ${names.length - 8} more` : ''
        warnings.push(
          `Embedded package '${spec.raw}' also matches ${names.length} package(s) that cannot`
          + ` be embedded as registry tarballs and were skipped: ${shown}${more}.`
          + ` The runner must be able to fetch these itself.`,
        )
      }
      if (spec.namePattern !== undefined) {
        wildcardMatches.push({
          spec: spec.raw,
          packages: candidates.map(entry => `${entry.name}@${entry.version}`),
        })
      }

      for (const entry of candidates) {
        tarballs.set(`${entry.name}@${entry.version}`, {
          ...entry,
          archiveFilename: `${entry.name.replace(/\//g, '+')}@${entry.version}.tgz`,
        })
      }
    }

    debug('plan: %d tarballs, %d issues, %d warnings', tarballs.size, issues.length, warnings.length)

    return {
      tarballs: [...tarballs.values()].sort((a, b) => a.archiveFilename.localeCompare(b.archiveFilename)),
      issues,
      warnings,
      wildcardMatches,
    }
  }

  async #materializeAll (): Promise<MaterializedTarball[]> {
    const { tarballs: explicitTarballs, issues, wildcardMatches } = await this.plan()

    // Commands validate before bundling and exit on fatal diagnostics, so
    // this is a defensive backstop for direct/programmatic use.
    if (issues.length > 0) {
      throw new EmbeddedPackageError(
        `Cannot embed packages due to configuration issues:\n\n`
        + issues.map(issue => `  ${issue.message}`).join('\n'),
      )
    }

    // Wildcards select invisibly, so say what they selected.
    for (const match of wildcardMatches) {
      const shown = match.packages.slice(0, 8).join(', ')
      const more = match.packages.length > 8 ? ` and ${match.packages.length - 8} more` : ''
      this.#info(
        `Embedded package pattern '${match.spec}' matched ${match.packages.length} package(s): ${shown}${more}.`,
      )
    }

    const detect = this.#options.detect === true && this.#projectRoot !== undefined
    if (explicitTarballs.length === 0 && !detect) {
      return []
    }

    // npm configuration problems (e.g. an unreadable .npmrc) must stay
    // fatal when the user explicitly configured packages — downloads need
    // the registry and credentials — but must not break projects that only
    // have default-on detection.
    let npmrcConfig: NpmrcConfig
    try {
      npmrcConfig = await loadNpmrcConfig(defaultNpmrcPaths(
        // The project root is always derivable here: explicit tarballs
        // imply a lockfile (missing one is a plan issue) and detection is
        // gated on it above.
        this.#projectRoot!,
        this.#homedir,
        this.#options.contextDir,
        this.#env,
      ), this.#env)
    } catch (err) {
      if (explicitTarballs.length > 0) {
        throw err
      }
      this.#warn(`Embedded package detection skipped: ${(err as Error).message}`)
      return []
    }

    const tarballs = [...explicitTarballs]
    if (detect) {
      try {
        tarballs.push(...await this.#detectTarballs(npmrcConfig, explicitTarballs))
      } catch (err) {
        this.#warn(`Embedded package detection failed and was skipped: ${(err as Error).message}`)
      }
    }

    if (tarballs.length === 0) {
      return []
    }

    const queue = new PQueue({ concurrency: DOWNLOAD_CONCURRENCY })
    const results = await queue.addAll(tarballs.map(tarball => async (): Promise<MaterializedTarball | undefined> => {
      let filePath: string
      try {
        filePath = await this.#obtainTarball(tarball, npmrcConfig)
      } catch (err) {
        // Auto-detected tarballs fail soft: the run proceeds without them,
        // exactly as it would have before detection existed. Explicitly
        // configured tarballs keep their guarantee.
        if (tarball.detected === true) {
          this.#warn(
            `Could not embed auto-detected package ${tarball.name}@${tarball.version}:`
            + ` ${(err as Error).message}`,
          )
          return undefined
        }
        throw err
      }
      return {
        ...tarball,
        filePath,
        archivePath: `${EMBEDDED_PACKAGES_ARCHIVE_DIR}/${tarball.archiveFilename}`,
      }
    }))

    return results.filter((result): result is MaterializedTarball => result !== undefined)
  }

  #warn (message: string): void {
    process.stderr.write(`Warning: ${message}\n`)
  }

  #info (message: string): void {
    process.stderr.write(`${message}\n`)
  }

  /**
   * Auto-detects lockfile packages the runner cannot fetch from the public
   * registry and returns them as planned tarballs, excluding names the
   * user configured explicitly (an explicit entry takes over its name).
   *
   * Everything here fails soft: detection is on by default, so an
   * unsupported lockfile, an unavailable registry API, or any unexpected
   * error must degrade to "detect nothing extra" with at most a warning,
   * unlike explicit specs which error. The caller catches whatever this
   * method throws and downgrades it to a warning.
   */
  async #detectTarballs (npmrcConfig: NpmrcConfig, explicitTarballs: PlannedTarball[]): Promise<PlannedTarball[]> {
    const { lockfilePath } = this.#options
    if (lockfilePath === undefined) {
      return []
    }

    let lockfileContent: string
    let registry: LockfileRegistryPackage[]
    let graph: LockfileDependencyGraph
    try {
      const { content, packages } = await this.#loadLockfile(lockfilePath)
      lockfileContent = content
      registry = packages.registry
      graph = packages.graph
    } catch (err) {
      debug('detection skipped, cannot enumerate lockfile %s: %s', lockfilePath, (err as Error).message)
      return []
    }

    // The plan already resolved every explicit spec against the lockfile
    // (unresolvable specs threw before detection could run), so the
    // planned tarballs are the authoritative record of explicit coverage:
    // an unpinned spec plans every lockfile version of its name, a pinned
    // spec only its own. An explicit spec takes over its package NAME for
    // embedding, but only the exact versions it materializes count as
    // covered for warning/degradation purposes.
    const explicitNames = new Set(explicitTarballs.map(tarball => tarball.name))
    const explicitKeys = new Set(explicitTarballs.map(tarball => `${tarball.name}@${tarball.version}`))

    // Entries whose exact name@version the explicit list already
    // materializes are withheld from detection: their verdicts would be
    // discarded at rehydration anyway, and this keeps their identities out
    // of even the opted-in public registry diff. Key-level on purpose —
    // OTHER lockfile versions of a listed name still flow through
    // detection (and, when opted in, the public diff, transmitting the
    // name) so the pin-blocked warning below can name them.
    const detectableRegistry = registry
      .filter(entry => !explicitKeys.has(`${entry.name}@${entry.version}`))

    const inputDigest = detectionInputDigest(
      lockfileContent, npmrcConfig, this.#env, this.#options.specs,
      this.#options.detectionFallback ?? 'skip')

    let embedKeys: Set<string>
    const summary = await this.#detectionCache.getSummary(inputDigest)
    if (summary !== undefined) {
      debug('detection summary cache hit (%d packages to embed)', summary.embedKeys.length)
      embedKeys = new Set(summary.embedKeys)
    } else {
      const detected = await this.#runDetection(detectableRegistry, npmrcConfig, graph, explicitKeys, explicitNames)
      embedKeys = detected.embedKeys
      if (!detected.degraded && !detected.usedAssumptions) {
        await this.#detectionCache.putSummary(inputDigest, { embedKeys: [...embedKeys] })
      }
      // Degraded runs still embed what the sound tiers proved (e.g.
      // scope-mapped packages), but are deliberately not cached so the
      // next run retries the undecided remainder. Runs that decided
      // anything by graph assumption are not cached either: the
      // assumptions must be re-derived — and replaced by real verdicts
      // once the private registry becomes interrogable — on every run.
    }

    // Rehydrate full entries from the lockfile: the cache contributes only
    // identities, never artifact locations or hashes.
    const detected: PlannedTarball[] = []
    const pinBlocked: string[] = []
    for (const entry of registry) {
      if (!embedKeys.has(verdictKey(entry))) {
        continue
      }
      if (explicitNames.has(entry.name)) {
        // An explicit entry takes over its package name: detection never
        // adds other versions of a listed name. When a pinned spec does
        // not materialize this exact version, though, detection has proved
        // private a version the bundle will not carry — that must be said
        // out loud, not dropped silently. (The exact-covered guard also
        // shields against a tampered summary smuggling covered keys in.)
        if (!explicitKeys.has(`${entry.name}@${entry.version}`)) {
          pinBlocked.push(`${entry.name}@${entry.version}`)
        }
        continue
      }
      detected.push({
        ...entry,
        archiveFilename: `${entry.name.replace(/\//g, '+')}@${entry.version}.tgz`,
        detected: true,
      })
    }
    if (pinBlocked.length > 0) {
      this.#warn(
        `Embedded package detection determined the following are private, but they are not embedded`
        + ` because 'checks.embeddedPackages' pins their names to other versions: ${pinBlocked.join(', ')}.`
        + ` Add them to 'checks.embeddedPackages' to embed them.`,
      )
    }

    if (detected.length > 0) {
      const names = detected.map(tarball => `${tarball.name}@${tarball.version}`)
      const shown = names.slice(0, 8).join(', ')
      const more = names.length > 8 ? ` and ${names.length - 8} more` : ''
      // Informational, not a warning: this is the feature working as
      // designed.
      this.#info(
        `Embedding ${names.length} auto-detected private package(s): ${shown}${more}.`
        + ` Disable with --no-detect-embedded-packages or 'checks.detectEmbeddedPackages: false'.`,
      )
    }

    return detected
  }

  /**
   * Runs detection tiers over the lockfile's registry entries. Returns the
   * {@link verdictKey}s to embed plus whether the run degraded (some
   * undecided entries could not be classified — the sound tiers'
   * results are still returned, but must not be cached as a summary).
   *
   * Private package names never leave the machine by default: undecided
   * entries are resolved by asking the project's own registry which
   * packages it hosts. Only the explicit `'public-registry'` fallback ever
   * queries public npm with package names, and only its verdicts are
   * cached per entry — they compare immutable artifacts, whereas
   * registry-inventory verdicts depend on the registry's topology and are
   * covered by the summary cache (whose key includes the registry
   * configuration) instead.
   */
  async #runDetection (
    registry: LockfileRegistryPackage[],
    npmrcConfig: NpmrcConfig,
    graph: LockfileDependencyGraph,
    explicitKeys: Set<string>,
    explicitNames: Set<string>,
  ): Promise<{ embedKeys: Set<string>, degraded: boolean, usedAssumptions: boolean }> {
    const classified = classifyEntries(registry, npmrcConfig, this.#env)
    debug(
      'detection: %d public by configuration, %d embed by scope mapping, %d undecided',
      classified.public.length, classified.embed.length, classified.undecided.length,
    )

    const embedKeys = new Set(classified.embed.map(verdictKey))
    let undecided = classified.undecided

    // Graph propagation lets the public-registry diff skip lookups for
    // packages a provably public parent vouches for. Seeded with what the
    // zero-network tier proved; verdicts settle into it as tiers run.
    // Explicitly listed packages count as embedded so their dependency
    // subtrees are verified rather than assumed. (An edgeless graph
    // degrades cleanly: every entry is parentless, so the whole set is
    // frontier and one diff verifies everything.)
    const propagation: PropagationContext = {
      graph,
      publicKeys: new Set(classified.public.map(graphKey)),
      embedKeys: new Set([...classified.embed.map(graphKey), ...explicitKeys]),
      privateNames: new Set([...classified.embed.map(entry => entry.name), ...explicitNames]),
      assumedCount: 0,
      multiUndecidedNames: new Set(),
    }
    // The single mutation point for "this entry is private": both key
    // spaces and the name-level evidence stay in sync.
    const recordEmbed = (entry: LockfileRegistryPackage): void => {
      embedKeys.add(verdictKey(entry))
      recordEmbedEvidence(propagation, entry)
    }

    // Configuration problems are diagnosed from configuration alone, up
    // front: a later tier may still decide the entries (or the verdict
    // cache may absorb them entirely), but a broken .npmrc must keep
    // warning — and keep the run uncached — until it is fixed. Covers both
    // registry mappings and credentials, for every entry detection will
    // act on (embed-tier entries get downloaded; undecided ones decided).
    const configErrors = new Set<string>()
    for (const entry of [...classified.embed, ...undecided]) {
      const recorded = entry.tarballUrl !== undefined ? nexusContentBase(entry.tarballUrl) : undefined
      try {
        const entryRegistryUrl = recorded ?? resolveRegistryUrl(npmrcConfig, entry.name, this.#env)
        resolveAuthHeader(npmrcConfig, entryRegistryUrl, this.#env)
      } catch (err) {
        configErrors.add(`the npm configuration could not be resolved (${(err as Error).message})`)
      }
    }
    for (const reason of configErrors) {
      this.#warn(
        `Embedded package detection hit a configuration problem: ${reason}.`
        + ` Detection continues with what it can prove, but the result is not cached and may differ`
        + ` from what a correct configuration would produce.`,
      )
    }

    if (undecided.length > 0) {
      // Per-entry verdicts cached from a previous run are immutable
      // integrity proofs (see #diffAndCacheVerdicts). Applying them is a
      // pure disk read — no network traffic and no privacy cost — so they
      // are deliberately not gated on the public-registry opt-in that
      // originally produced them; the cache directory carries the same
      // local trust the summary cache already gets.
      const known = await this.#detectionCache.getVerdicts()
      undecided = undecided.filter(entry => {
        const verdict = known[verdictKey(entry)]
        if (verdict === 'embed') {
          recordEmbed(entry)
        } else if (verdict === 'public') {
          // Cached diff verdicts are integrity proofs, so they seed graph
          // propagation just like the zero-network tier's publics.
          propagation.publicKeys.add(graphKey(entry))
        }
        return verdict === undefined
      })
    }

    if (undecided.length === 0) {
      return { embedKeys, degraded: configErrors.size > 0, usedAssumptions: false }
    }

    // Computed over the run-wide undecided set, after the verdict cache is
    // applied but before grouping: groups run sequentially, and a
    // per-group count would miss a sibling version living in another
    // group.
    const undecidedNameCounts = new Map<string, number>()
    for (const entry of undecided) {
      undecidedNameCounts.set(entry.name, (undecidedNameCounts.get(entry.name) ?? 0) + 1)
    }
    for (const [name, count] of undecidedNameCounts) {
      if (count > 1) {
        propagation.multiUndecidedNames.add(name)
      }
    }

    // Group undecided entries by the registry instance to interrogate: the
    // recorded source URL when the lockfile has a usable (Nexus-shaped)
    // one — it names the instance the artifact really came from, which
    // current configuration may no longer point at. A non-Nexus-shaped
    // recorded source falls back to the configured registry only when it
    // shares that registry's origin, and only CONSERVATIVELY: the fallback
    // instance may prove such an entry private (hosted => embed; safe by
    // the over-embed rule) but its silence proves nothing — a same-origin
    // host can path-route several registry products — so "not hosted"
    // leaves the entry undecided instead of minting a public verdict.
    // Entries from unrelated hosts degrade outright ('' group).
    interface DetectionGroup {
      registryUrl: string
      entries: LockfileRegistryPackage[]
      conservative: boolean
      /**
       * Why the group's registry cannot be interrogated, when known at
       * grouping time. The group still runs through the tiers so the
       * opted-in fallback can decide it; without the opt-in this becomes
       * the skip reason.
       */
      unavailableReason?: string
    }
    const groups = new Map<string, DetectionGroup>()
    for (const entry of undecided) {
      let registryUrl = entry.tarballUrl !== undefined
        ? nexusContentBase(entry.tarballUrl)
        : undefined
      let conservative = false
      let unavailableReason: string | undefined
      if (registryUrl === undefined) {
        let configured: string | undefined
        try {
          configured = resolveRegistryUrl(npmrcConfig, entry.name, this.#env)
        } catch (err) {
          unavailableReason = `the configured registry could not be resolved (${(err as Error).message})`
        }
        if (entry.tarballUrl === undefined) {
          registryUrl = configured ?? ''
        } else if (configured !== undefined && sameOrigin(entry.tarballUrl, configured)) {
          registryUrl = configured
          conservative = true
        } else {
          registryUrl = ''
        }
      }
      if (registryUrl === '' && unavailableReason === undefined) {
        unavailableReason = `The packages' recorded source cannot be interrogated and does not match`
          + ` the configured registry`
      }
      const key = `${conservative ? 'conservative' : 'authoritative'}\0${registryUrl}\0${unavailableReason ?? ''}`
      const group = groups.get(key) ?? { registryUrl, entries: [], conservative, unavailableReason }
      group.entries.push(entry)
      groups.set(key, group)
    }

    // Interrogating the same instance twice (two groups sharing one REST
    // base) would double the request budget for nothing; share the
    // repository listing and inventory per instance. The per-group
    // source-repo visibility guard still runs for every group.
    const instanceState: InstanceState = {
      repositories: new Map(),
      inventories: new Map(),
    }
    const skipped: Array<{ entry: LockfileRegistryPackage, reason: string }> = []
    let restRemediable = false
    // Nexus-shaped groups run first: embeds their inventories prove then
    // expose those packages' children to later groups' diffs, which would
    // otherwise be free to assume them public via some other public
    // parent. This is a heuristic ordering, not a guarantee — a group
    // whose registry unexpectedly fails mid-run still leaves its verdicts
    // unknown to groups already processed.
    const inventoryCapable = (group: DetectionGroup): boolean => {
      if (group.unavailableReason !== undefined) {
        return false
      }
      try {
        // The same predicate #decideUndecided applies, so the ordering
        // cannot drift from what the registry API actually supports.
        return NexusRegistryApi.forRegistry(group.registryUrl, npmrcConfig, this.#env) !== undefined
      } catch {
        return false
      }
    }
    const orderedGroups = [...groups.values()]
      .sort((a, b) => Number(inventoryCapable(b)) - Number(inventoryCapable(a)))
    for (const group of orderedGroups) {
      try {
        const { verdicts, tier } = await this.#decideUndecided(
          group.registryUrl, group.entries, npmrcConfig, instanceState, propagation, group.unavailableReason)
        // The conservative rule only distrusts the hosted inventory's
        // silence — a 'public' verdict from the public-registry diff (an
        // integrity proof, or the graph assumption that deliberately rides
        // along with it) holds for conservative groups too. The
        // assumption's risk profile is uniform across groups: every
        // undecided entry resolves from a non-public source, whichever
        // group it lands in, and excluding conservative groups would
        // disable the pruning for exactly the non-Nexus registries the
        // fallback exists for.
        const unresolved: LockfileRegistryPackage[] = []
        for (const [entry, verdict] of verdicts) {
          if (verdict === 'embed') {
            // Registry-inventory embeds settle into the propagation state
            // too, exposing the children of hosted private packages to
            // later groups' diffs. (Inventory 'public' means only "not
            // hosted here" — never a propagation seed.)
            recordEmbed(entry)
          } else if (group.conservative && tier === 'registry-inventory') {
            unresolved.push(entry)
          }
        }
        if (unresolved.length > 0) {
          skipped.push(...await this.#settleConservativeLeftovers(unresolved, recordEmbed, propagation))
        }
      } catch (err) {
        const partial = this.#applyPartialVerdicts(err, recordEmbed)
        const reason = err instanceof DetectionUnavailableError
          ? err.message
          : `Unexpected error: ${(err as Error).message}`
        restRemediable ||= err instanceof DetectionUnavailableError && err.restAccessRemediable === true
        skipped.push(...group.entries
          .filter(entry => partial?.has(entry) !== true)
          .map(entry => ({ entry, reason })))
      }
    }

    // Every skipped entry warns and keeps the run uncached: entries the
    // explicit list covers were filtered out before the tiers ran.
    const degraded = skipped.length > 0 || configErrors.size > 0
    if (skipped.length > 0) {
      const reasons = [...new Set(skipped.map(({ reason }) => reason))]
      const remedies = [
        ...(configErrors.size > 0
          ? [`fix the configuration problem(s) named in the preceding warning`]
          : []),
        // Only offered when some failure was actually about REST access —
        // for e.g. conservative same-origin skips the REST API answered
        // fine, and permission advice would just mislead.
        ...(restRemediable
          ? [`grant the configured npm credentials access to the registry's REST API`
            + ` (detection needs to browse every npm hosted repository on the instance)`]
          : []),
        `list the packages in 'checks.embeddedPackages'`,
        ...(this.#options.detectionFallback !== 'public-registry'
          ? [`set 'checks.detectEmbeddedPackagesFallback: "public-registry"' to allow public npm`
            + ` registry lookups`]
          : []),
        `disable detection with --no-detect-embedded-packages or 'checks.detectEmbeddedPackages: false'`,
      ]
      this.#warn(
        `Embedded package detection could not determine whether ${skipped.length} package(s)`
        + ` from your registry are private, and skipped embedding them.`
        + ` Reason(s): ${reasons.join('; ')}.`
        + ` To fix this, ${remedies.slice(0, -1).join(', ')}, or ${remedies[remedies.length - 1]}.`,
      )
    }

    return { embedKeys, degraded, usedAssumptions: propagation.assumedCount > 0 }
  }

  /**
   * Conservative-group entries the hosted inventory stayed silent about
   * are still undecided. The opted-in public-registry diff can settle them
   * (its verdicts are integrity proofs); without the opt-in — or when the
   * diff itself fails — they are skipped.
   */
  async #settleConservativeLeftovers (
    unresolved: LockfileRegistryPackage[],
    recordEmbed: (entry: LockfileRegistryPackage) => void,
    propagation: PropagationContext,
  ): Promise<Array<{ entry: LockfileRegistryPackage, reason: string }>> {
    if (this.#options.detectionFallback !== 'public-registry') {
      return unresolved.map(entry => ({ entry, reason: CONSERVATIVE_UNDETERMINED_REASON }))
    }
    try {
      const diffed = await this.#diffAndCacheVerdicts(unresolved, propagation)
      for (const [entry, verdict] of diffed) {
        if (verdict === 'embed') {
          recordEmbed(entry)
        }
      }
      return []
    } catch (err) {
      const partial = this.#applyPartialVerdicts(err, recordEmbed)
      // Both branches keep the same-origin context so the warning states
      // which tier stayed silent and which one then failed.
      const reason = err instanceof DetectionUnavailableError
        ? `${CONSERVATIVE_UNDETERMINED_REASON}, and the public registry fallback failed (${err.message})`
        : `${CONSERVATIVE_UNDETERMINED_REASON}, and the public registry fallback failed unexpectedly`
          + ` (${(err as Error).message})`
      return unresolved
        .filter(entry => partial?.has(entry) !== true)
        .map(entry => ({ entry, reason }))
    }
  }

  /**
   * A failed public diff still carries the verdicts it collected before
   * failing. Applies the 'embed' ones and returns the partial map so the
   * caller can skip only what genuinely stayed undecided.
   */
  #applyPartialVerdicts (
    err: unknown,
    recordEmbed: (entry: LockfileRegistryPackage) => void,
  ): Map<LockfileRegistryPackage, DetectionVerdict> | undefined {
    const partial = err instanceof DetectionUnavailableError ? err.partialVerdicts : undefined
    for (const [entry, verdict] of partial ?? []) {
      if (verdict === 'embed') {
        // Recording seeds the propagation state too, so children of a
        // package a failed diff still proved private are verified rather
        // than assumed in later groups.
        recordEmbed(entry)
      }
    }
    return partial
  }

  /**
   * Decides one registry's worth of undecided entries: primarily by
   * interrogating that registry's REST API (no package names leave the
   * machine), with the public-registry integrity diff as an explicit
   * opt-in fallback. The returned tier states which of the two produced
   * the verdicts — a hosted inventory's 'public' means only "not hosted
   * here", whereas the diff's 'public' is an integrity proof.
   */
  async #decideUndecided (
    registryUrl: string,
    entries: LockfileRegistryPackage[],
    npmrcConfig: NpmrcConfig,
    instanceState: InstanceState,
    propagation: PropagationContext,
    unavailableReason?: string,
  ): Promise<{
    verdicts: Map<LockfileRegistryPackage, DetectionVerdict>
    tier: 'registry-inventory' | 'public-diff'
  }> {
    try {
      if (unavailableReason !== undefined) {
        throw new DetectionUnavailableError(unavailableReason)
      }
      const nexus = NexusRegistryApi.forRegistry(registryUrl, npmrcConfig, this.#env)
      if (nexus === undefined) {
        throw new DetectionUnavailableError(
          `The registry URL does not look like a Sonatype Nexus Repository instance,`
          + ` which is the only registry API supported for private package detection`,
        )
      }
      debug('detection: consulting the registry API for %d entries', entries.length)
      // Memoized per instance AND credentials (the listing is permission
      // filtered); the visibility guard still runs per group, since two
      // groups on one instance may install from different repositories.
      const repositories = getOrCreate(instanceState.repositories, nexus.cacheKey,
        () => nexus.listRepositories())
      nexus.assertSourceRepoVisible(await repositories)
      const inventory = getOrCreate(instanceState.inventories, nexus.cacheKey,
        () => repositories.then(list => nexus.hostedInventory(list)))
      return { verdicts: decideWithHostedInventory(entries, await inventory), tier: 'registry-inventory' }
    } catch (err) {
      if (this.#options.detectionFallback !== 'public-registry') {
        throw err
      }
      debug('detection: registry API unavailable (%s), using the public registry fallback', (err as Error).message)
      try {
        return { verdicts: await this.#diffAndCacheVerdicts(entries, propagation), tier: 'public-diff' }
      } catch (fallbackErr) {
        // The fallback failing must not erase the registry tier's failure:
        // the warning needs both causes, and the REST remedy stays
        // applicable when the registry tier was permission-refused.
        const combined = new DetectionUnavailableError(
          `${(err as Error).message}; the public registry fallback then also failed`
          + ` (${(fallbackErr as Error).message})`,
          {
            cause: fallbackErr,
            restAccessRemediable:
              (err instanceof DetectionUnavailableError && err.restAccessRemediable === true)
              || (fallbackErr instanceof DetectionUnavailableError && fallbackErr.restAccessRemediable === true),
          },
        )
        if (fallbackErr instanceof DetectionUnavailableError) {
          combined.partialVerdicts = fallbackErr.partialVerdicts
        }
        throw combined
      }
    }
  }

  /**
   * The opt-in public-registry diff. Every PROVEN verdict it obtains is
   * persisted — including the partial results of a failed run — because
   * those verdicts compare immutable artifacts and are cacheable forever,
   * and a name transmitted once should never need transmitting again.
   * Callers pass cache misses only: #runDetection applies the persistent
   * verdict cache before any tier runs.
   *
   * The diff runs in dependency-graph frontier rounds: entries a provably
   * public parent vouches for are assumed public without a lookup (their
   * names are never transmitted), and only the exposed surface —
   * workspace-direct dependencies, children of embedded packages,
   * parentless entries — is verified. Each round's proofs propagate before
   * the next round runs, so verification stops at the boundary of the
   * public part of the tree. Assumed verdicts are refutable (a private
   * artifact shadowing a public name under a public parent would be
   * missed, failing the runner's lockfile integrity check loudly at
   * install time) and are therefore never persisted.
   */
  async #diffAndCacheVerdicts (
    entries: LockfileRegistryPackage[],
    propagation: PropagationContext,
  ): Promise<Map<LockfileRegistryPackage, DetectionVerdict>> {
    const persist = async (diffed: Map<LockfileRegistryPackage, DetectionVerdict>): Promise<void> => {
      if (diffed.size === 0) {
        return
      }
      await this.#detectionCache.putVerdicts(
        Object.fromEntries([...diffed].map(([entry, verdict]) => [verdictKey(entry), verdict])))
    }

    const verdicts = new Map<LockfileRegistryPackage, DetectionVerdict>()
    let undecided = entries
    while (undecided.length > 0) {
      const round = planPropagationRound(undecided, propagation)

      // Assumption is the last resort before actual stalls: it runs only
      // when no exposed entry remains to verify, so every proof — and
      // every piece of embed/private-name evidence a query can surface —
      // has landed before anything is assumed.
      if (round.frontier.length === 0 && round.assumed.length > 0) {
        debug('detection: %d package(s) assumed public via public parents', round.assumed.length)
        propagation.assumedCount += round.assumed.length
        const assumedSet = new Set(round.assumed)
        for (const entry of round.assumed) {
          verdicts.set(entry, 'public')
          propagation.publicKeys.add(graphKey(entry))
        }
        undecided = undecided.filter(entry => !assumedSet.has(entry))
        continue
      }

      // Query priority: the exposed frontier; failing that, the minimal
      // stall-breaking set (cycle entry points and multi-version names a
      // public parent reaches — their verdicts unlock their deferred
      // descendants for assumption); failing that, everything left (no
      // public parent reaches the remainder, so nothing could ever be
      // assumed anyway). One packument settles every version of a name,
      // so same-name entries ride along for free.
      const toQuery = round.frontier.length > 0
        ? round.frontier
        : round.stallBreakers.length > 0 ? round.stallBreakers : undecided
      const queriedNames = new Set(toQuery.map(entry => entry.name))
      const frontier = undecided.filter(entry => queriedNames.has(entry.name))

      try {
        const diffed = await diffAgainstPublicRegistry(frontier, {
          publicRegistryUrl: this.#options.publicRegistryUrl,
        })
        await persist(diffed)
        for (const [entry, verdict] of diffed) {
          verdicts.set(entry, verdict)
          if (verdict === 'public') {
            propagation.publicKeys.add(graphKey(entry))
          } else {
            recordEmbedEvidence(propagation, entry)
          }
        }
        undecided = undecided.filter(entry => !diffed.has(entry))
      } catch (err) {
        if (err instanceof DetectionUnavailableError) {
          await persist(err.partialVerdicts ?? new Map())
          // Callers treat partialVerdicts as "already decided" — merge in
          // the earlier rounds' proofs and the assumed publics so only
          // what genuinely stayed undecided is reported skipped. Proofs
          // were persisted as their rounds completed; the merged map is
          // never persisted again.
          const merged = new Map([...verdicts, ...err.partialVerdicts ?? []])
          if (merged.size > 0) {
            err.partialVerdicts = merged
          }
        }
        throw err
      }
    }
    return verdicts
  }

  async #obtainTarball (tarball: PlannedTarball, npmrcConfig: NpmrcConfig): Promise<string> {
    const cached = await this.#cache.get(tarball.integrity)
    if (cached !== undefined) {
      debug('%s@%s: CLI cache hit', tarball.name, tarball.version)
      return cached
    }

    const fromNpmCacache = await lookupNpmCacache(tarball.integrity, this.#env, process.platform, this.#homedir)
    if (fromNpmCacache !== undefined) {
      debug('%s@%s: npm cache hit', tarball.name, tarball.version)
      return await this.#cache.put(tarball.integrity, fromNpmCacache)
    }

    const url = tarball.tarballUrl ?? this.#deriveTarballUrl(tarball, npmrcConfig)
    if (!URL.canParse(url)) {
      throw new EmbeddedPackageError(
        `The tarball URL for embedded package '${tarball.name}@${tarball.version}'`
        + ` is not a valid URL: '${redactUrl(url)}'. Check the 'registry' configuration`
        + ` in your .npmrc (it must be an absolute URL including the protocol).`,
      )
    }
    debug('%s@%s: downloading from %s', tarball.name, tarball.version, redactUrl(url))
    const content = await this.#download(tarball, url, npmrcConfig)

    if (!verifyIntegrity(content, tarball.integrity)) {
      throw new EmbeddedPackageError(
        `The tarball downloaded for embedded package '${tarball.name}@${tarball.version}'`
        + ` from '${redactUrl(url)}' does not match the integrity hash recorded in the lockfile`
        + ` ('${tarball.integrity}'). The registry may be serving a different artifact`
        + ` than the one the lockfile was created against.`,
      )
    }

    return await this.#cache.put(tarball.integrity, content)
  }

  #deriveTarballUrl (tarball: PlannedTarball, npmrcConfig: NpmrcConfig): string {
    const registryUrl = resolveRegistryUrl(npmrcConfig, tarball.name, this.#env)
    const basename = tarball.name.split('/').pop()
    return `${registryUrl}${tarball.name}/-/${basename}-${tarball.version}.tgz`
  }

  async #download (tarball: PlannedTarball, url: string, npmrcConfig: NpmrcConfig): Promise<Buffer> {
    const authHeader = resolveAuthHeader(npmrcConfig, url, this.#env)

    try {
      const response = await axios.get<ArrayBuffer>(url, assignProxy(url, {
        responseType: 'arraybuffer',
        headers: {
          // Ask for the raw artifact: a registry or proxy that labels the
          // already-gzipped tarball with `Content-Encoding: gzip` would
          // otherwise make axios gunzip it, breaking integrity verification
          // with a misleading "different artifact" error.
          'accept-encoding': 'identity',
          ...(authHeader !== undefined ? { authorization: authHeader } : {}),
        },
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxContentLength: MAX_TARBALL_BYTES,
      }))
      return Buffer.from(response.data)
    } catch (err: any) {
      const status = err?.response?.status
      const statusHint = status !== undefined ? ` (HTTP ${status})` : ''
      const authHint = status === 401 || status === 403
        ? ` Check that your .npmrc contains valid credentials for this registry.`
        : ''
      throw new EmbeddedPackageError(
        `Failed to download embedded package '${tarball.name}@${tarball.version}'`
        + ` from '${redactUrl(url)}'${statusHint}.${authHint}`,
        { cause: err },
      )
    }
  }
}
