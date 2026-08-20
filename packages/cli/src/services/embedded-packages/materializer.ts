import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import axios from 'axios'
import Debug from 'debug'
import PQueue from 'p-queue'

import { assignProxy } from '../proxy.js'
import { TarballCache, lookupNpmCacache } from './cache.js'
import { verifyIntegrity } from './integrity.js'
import {
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
  /** The offending `bundle.packages.embed` entry, when tied to one. */
  spec?: string
  message: string
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

/**
 * Resolves the configured `bundle.packages.embed` specs against the
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
  #env: NodeJS.ProcessEnv
  #homedir: string

  #plan?: Promise<EmbeddedPackagesPlan>
  #materialized?: Promise<MaterializedTarball[]>

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

  #info (message: string): void {
    process.stderr.write(`${message}\n`)
  }

  materialize (): Promise<MaterializedTarball[]> {
    this.#materialized ??= this.#materializeAll()
    return this.#materialized
  }

  async #createPlan (): Promise<EmbeddedPackagesPlan> {
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
      packages = await loadLockfilePackages(lockfilePath)
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
    const { tarballs, issues, wildcardMatches } = await this.plan()

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

    if (tarballs.length === 0) {
      return []
    }

    // Safe to assert: a missing lockfile is a plan issue, and issues abort
    // above.
    const npmrcConfig = await loadNpmrcConfig(defaultNpmrcPaths(
      this.#projectRoot!,
      this.#homedir,
      this.#options.contextDir,
    ), this.#env)

    const queue = new PQueue({ concurrency: DOWNLOAD_CONCURRENCY })
    const results = await queue.addAll(tarballs.map(tarball => async (): Promise<MaterializedTarball> => {
      const filePath = await this.#obtainTarball(tarball, npmrcConfig)
      return {
        ...tarball,
        filePath,
        archivePath: `${EMBEDDED_PACKAGES_ARCHIVE_DIR}/${tarball.archiveFilename}`,
      }
    }))

    return results
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
