import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import Debug from 'debug'

import { resolveCacheDirs } from './cache.js'
import { DetectionVerdict } from './detection.js'
import { LockfileRegistryPackage } from './lockfile-packages.js'
import { NpmrcConfig, expandedCredentialEntries, expandedRegistryEntries } from './npmrc.js'

const debug = Debug('checkly:cli:services:embedded-packages')

/**
 * Bump to invalidate cached detection summaries when anything that could
 * alter the embed set changes — the detection algorithm itself, but also
 * lockfile enumeration and registry-configuration handling.
 */
export const DETECTOR_VERSION = 4

/**
 * Versions the per-entry verdict file separately from the summaries:
 * verdicts are immutable integrity proofs (see {@link verdictKey}), so a
 * summary-semantics bump must not discard them — for opted-in users a
 * discarded verdict means re-transmitting a package name to the public
 * registry, not just a latency cost. Bump only when verdict semantics or
 * the key format change.
 */
const VERDICTS_VERSION = 2

export interface DetectionSummary {
  /**
   * {@link verdictKey} values of the packages to embed. Deliberately keys
   * only: the caller rehydrates full entries (including the tarball URL
   * and integrity used for downloads) from the current lockfile, so a
   * tampered or stale cache can never introduce an artifact the lockfile
   * does not vouch for.
   */
  embedKeys: string[]
}

/**
 * The key for a detection verdict. Verdicts are immutable under this key:
 * a published artifact can never change, so an integrity match against the
 * public registry can never un-match, and a stale `embed` verdict is
 * harmless because over-embedding is allowed by the bundle contract.
 */
export function verdictKey (entry: LockfileRegistryPackage): string {
  return `${entry.name}@${entry.version}::${entry.integrity}`
}

/**
 * The digest identifying a whole detection run: the lockfile bytes, the
 * registry-affecting npm configuration (`registry` and `@scope:registry`
 * entries, with `${VAR}` references expanded), the (expanded) credential
 * entries, the explicitly configured package names, and the fallback mode
 * — any of these changing must invalidate the summary even when the
 * lockfile is unchanged.
 */
export function detectionInputDigest (
  lockfileContent: string,
  npmrcConfig: NpmrcConfig,
  env: NodeJS.ProcessEnv = process.env,
  explicitSpecs: string[] = [],
  detectionFallback = 'skip',
): string {
  // Expanded values: a registry remap expressed through an environment
  // variable reference must invalidate the summary too.
  const registryEntries = expandedRegistryEntries(npmrcConfig, env)
  // Credentials influence detection results: the registry API filters its
  // repository listing by permission, so a verdict produced under one set
  // of credentials must not outlive a credentials change — including a
  // token rotated behind a `${NPM_TOKEN}` reference, hence the expansion.
  // The values only feed the hash; they are never stored.
  const credentialEntries = expandedCredentialEntries(npmrcConfig, env)
  return createHash('sha256')
    .update(lockfileContent)
    .update('\0')
    .update(JSON.stringify(registryEntries))
    .update('\0')
    .update(JSON.stringify(credentialEntries))
    // Explicitly configured entries participate: entries detection could
    // not decide may still count as covered (non-degraded, hence
    // cacheable) when the user listed them, so changing the explicit list
    // must trigger re-detection.
    .update('\0')
    .update(JSON.stringify([...explicitSpecs].sort()))
    // The fallback mode changes what a run can decide — an embed set
    // derived with graph assumptions under 'public-registry' must not be
    // served from the summary cache after the option is set back to
    // 'skip'.
    .update('\0')
    .update(detectionFallback)
    .digest('hex')
}

/**
 * Persistent detection state in the CLI cache (same multi-root layout as
 * the tarball cache: project-local `node_modules/.cache/checkly` first,
 * per-user directory as read tier and write fallback). Two levels:
 *
 * - a summary (the full embed set) keyed by {@link detectionInputDigest},
 *   making repeat runs with an unchanged lockfile free, and
 * - per-entry verdicts keyed by {@link verdictKey}, so a lockfile change
 *   only pays for entries not seen before.
 *
 * All operations are best-effort: a cache problem degrades to re-detection,
 * never to a user-facing error.
 */
export class DetectionCache {
  #rootDirs: string[]

  constructor (rootDirs: string | string[]) {
    this.#rootDirs = Array.isArray(rootDirs) ? rootDirs : [rootDirs]
  }

  static default (
    env: NodeJS.ProcessEnv = process.env,
    projectRoot?: string,
    platform: NodeJS.Platform = process.platform,
    homedir = os.homedir(),
  ): DetectionCache {
    return new DetectionCache(resolveCacheDirs(env, projectRoot, platform, homedir)
      .map(dir => path.join(dir, 'embedded-packages', 'detection')))
  }

  #summaryFilename (inputDigest: string): string {
    return `summary-v${DETECTOR_VERSION}-${inputDigest}.json`
  }

  #verdictsFilename (): string {
    return `verdicts-v${VERDICTS_VERSION}.json`
  }

  async #readJsonFrom<T> (rootDir: string, filename: string): Promise<T | undefined> {
    try {
      return JSON.parse(await fs.readFile(path.join(rootDir, filename), 'utf8')) as T
    } catch {
      return undefined
    }
  }

  async #readJson<T> (filename: string): Promise<T | undefined> {
    for (const rootDir of this.#rootDirs) {
      const value = await this.#readJsonFrom<T>(rootDir, filename)
      if (value !== undefined) {
        return value
      }
    }
    return undefined
  }

  async #writeJson (filename: string, value: unknown): Promise<string | undefined> {
    for (const rootDir of this.#rootDirs) {
      const filePath = path.join(rootDir, filename)
      const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
      try {
        await fs.mkdir(rootDir, { recursive: true })
        await fs.writeFile(tempPath, JSON.stringify(value))
        await fs.rename(tempPath, filePath)
        return rootDir
      } catch (err) {
        debug('detection cache write to %s failed: %s', rootDir, (err as Error).message)
      } finally {
        await fs.rm(tempPath, { force: true }).catch(() => {})
      }
    }
    return undefined
  }

  async getSummary (inputDigest: string): Promise<DetectionSummary | undefined> {
    const summary = await this.#readJson<DetectionSummary>(this.#summaryFilename(inputDigest))
    // Validate the shape: a structurally wrong cache file must degrade to
    // a miss, not throw downstream.
    if (!Array.isArray(summary?.embedKeys) || summary.embedKeys.some(key => typeof key !== 'string')) {
      return undefined
    }
    return summary
  }

  async putSummary (inputDigest: string, summary: DetectionSummary): Promise<void> {
    const rootDir = await this.#writeJson(this.#summaryFilename(inputDigest), summary)
    if (rootDir !== undefined) {
      await this.#pruneSummaries(rootDir)
    }
  }

  /**
   * Keeps only the most recent summary files: they are keyed by lockfile
   * revision and would otherwise accumulate forever.
   */
  async #pruneSummaries (rootDir: string, keep = 10): Promise<void> {
    try {
      const names = (await fs.readdir(rootDir)).filter(name => /^summary-v\d+-[0-9a-f]+\.json$/.test(name))
      if (names.length <= keep) {
        return
      }
      const stats = await Promise.all(names.map(async name => ({
        name,
        mtimeMs: (await fs.stat(path.join(rootDir, name))).mtimeMs,
      })))
      stats.sort((a, b) => b.mtimeMs - a.mtimeMs)
      for (const { name } of stats.slice(keep)) {
        await fs.rm(path.join(rootDir, name), { force: true })
      }
    } catch (err) {
      debug('detection cache prune failed: %s', (err as Error).message)
    }
  }

  async getVerdicts (): Promise<Record<string, DetectionVerdict>> {
    // Merge across every root: with a readable-but-unwritable primary
    // root, writes land in the fallback root, and a first-hit read would
    // permanently ignore them.
    let merged: Record<string, DetectionVerdict> = {}
    for (const rootDir of [...this.#rootDirs].reverse()) {
      const verdicts = await this.#readJsonFrom<unknown>(rootDir, this.#verdictsFilename())
      if (typeof verdicts !== 'object' || verdicts === null || Array.isArray(verdicts)) {
        continue
      }
      merged = {
        ...merged,
        ...Object.fromEntries(Object.entries(verdicts)
          .filter(([, value]) => value === 'public' || value === 'embed')),
      }
    }
    return merged
  }

  /**
   * Merges the given verdicts into the stored map. Concurrent writers can
   * race (last write wins); acceptable for an immutable-verdict cache
   * whose entries are only ever re-derivable.
   */
  async putVerdicts (verdicts: Record<string, DetectionVerdict>): Promise<void> {
    let merged = { ...await this.getVerdicts(), ...verdicts }
    // Bound the map: entries are immutable and re-derivable, so when years
    // of dependency churn blow past the cap it is cheaper to start over
    // (keeping the fresh verdicts) than to rewrite an ever-growing file on
    // every run.
    const MAX_VERDICTS = 10_000
    if (Object.keys(merged).length > MAX_VERDICTS) {
      merged = { ...verdicts }
    }
    const rootDir = await this.#writeJson(this.#verdictsFilename(), merged)
    if (rootDir !== undefined) {
      await this.#pruneStaleVerdicts(rootDir)
    }
  }

  /**
   * Verdict files from superseded versions are never read or written again
   * and would otherwise sit in the cache (often persisted by CI) forever.
   * Only strictly OLDER versions are removed — a newer CLI's file must
   * survive an older CLI running against the same (e.g. per-user) cache
   * root — and only in the root this instance just wrote to, so CLIs of
   * different versions sharing the other roots are left alone.
   */
  async #pruneStaleVerdicts (rootDir: string): Promise<void> {
    try {
      const names = (await fs.readdir(rootDir)).filter(name => {
        const match = /^verdicts-v(\d+)\.json$/.exec(name)
        return match !== null && Number(match[1]) < VERDICTS_VERSION
      })
      for (const name of names) {
        await fs.rm(path.join(rootDir, name), { force: true })
      }
    } catch (err) {
      debug('detection cache prune failed: %s', (err as Error).message)
    }
  }
}
