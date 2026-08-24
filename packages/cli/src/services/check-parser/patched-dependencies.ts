import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import Debug from 'debug'
import { isMap, parse as parseYaml, parseDocument } from 'yaml'

import { pathToPosix } from '../util.js'

const debug = Debug('checkly:cli:services:check-parser:patched-dependencies')

/**
 * Serialization options that make a `yaml` round trip of a pnpm lockfile
 * byte-identical to what pnpm itself writes. `lineWidth: 0` disables the
 * folding that would otherwise rewrap long `resolution:` lines, and
 * `flowCollectionPadding: false` reproduces pnpm's unpadded `{integrity: ...}`
 * spelling. Both are required; with either one at its default the serializer
 * reformats lines it was not asked to touch.
 */
const YAML_STRINGIFY_OPTIONS = { lineWidth: 0, flowCollectionPadding: false } as const

const PATCHED_DEPENDENCIES = 'patchedDependencies'

/**
 * The directory pnpm's own `pnpm patch-commit` writes patches to, relative to
 * the workspace root. Shared so that the auto-include that bundles patches and
 * the filtering that removes them cannot drift apart: widening one without the
 * other would silently leave orphaned patch files in every bundle.
 */
export const PNPM_PATCHES_DIR = 'patches'

/**
 * Whether an archive path names a patch file the filtering may remove from a
 * bundle: a `.patch` directly under {@link PNPM_PATCHES_DIR}. A declaration
 * may point anywhere, including at a file bundled for an unrelated reason, so
 * only the conventional location is removable.
 */
export function isRemovablePatchPath (archivePath: string): boolean {
  return new RegExp(`^${PNPM_PATCHES_DIR}/[^/]+\\.patch$`).test(archivePath)
}

/**
 * Where a pnpm project can declare `patchedDependencies`. Both are live:
 * pnpm 10 reads the `package.json` field (and prefers it over
 * `pnpm-workspace.yaml` when both are populated), while pnpm 11 ignores it
 * and reads only `pnpm-workspace.yaml`.
 */
export type PatchConfigKind = 'pnpm-workspace.yaml' | 'package.json'

/** One of the bundle's declaring config files. */
export interface PatchConfigFile {
  /** Posix path of the file within the archive, e.g. `pnpm-workspace.yaml`. */
  archivePath: string
  kind: PatchConfigKind
  content: string
}

export interface RewrittenFile {
  archivePath: string
  content: string
}

/**
 * A complete, ready-to-apply description of the patch declarations to remove
 * from a bundle. Everything is computed up front so that applying it is pure
 * map mutation: a half-applied filter ships a bundle whose config and lockfile
 * disagree, which fails the remote install outright.
 */
export interface PatchFilterPlan {
  /** The `patchedDependencies` keys that no longer apply to anything. */
  unusedKeys: string[]
  /** The declaring config, rewritten without those keys. */
  rewrittenConfig: RewrittenFile
  /**
   * Archive paths of patch files that only the removed declarations
   * referenced. Paths resolving outside the workspace root are never listed.
   */
  droppedPatchPaths: string[]
  /** The pruned lockfile, rewritten without those keys. */
  lockfileContent: string
}

export interface PlanPatchFilterOptions {
  configs: PatchConfigFile[]
  /** The workspace's own lockfile, as committed — before pruning. */
  originalLockfileContent: string
  /**
   * The lockfile the prune regenerated. Must come from a prune that passed the
   * pruner's own verification (see `verifyPrunedLockfile`): that check is what
   * guarantees the two lockfiles spell `patch_hash=` markers comparably, which
   * is the premise the used/unused decision rests on. Handed an unverified
   * regeneration — one written by a pnpm that disagrees about which
   * declaration site is live — the comparison could read a patch that is
   * genuinely in force as no longer applied.
   */
  prunedLockfileContent: string
}

interface PatchDeclaration {
  key: string
  /** The patch file path exactly as the config spells it. */
  patchPath: string
}

/**
 * Reads a config's `patchedDependencies` map. Returns an empty map when the
 * config declares none, and `undefined` when the file cannot be parsed or the
 * map is not shaped as expected — callers treat that as "do not filter".
 */
export function readPatchedDependencies (config: PatchConfigFile): PatchDeclaration[] | undefined {
  let parsed: unknown
  try {
    parsed = config.kind === 'package.json'
      ? JSON.parse(config.content)
      // An empty or comment-only YAML document parses to null: an ordinary
      // pnpm-workspace.yaml that declares no settings, not an unreadable file.
      // JSON has no such spelling — JSON.parse throws on empty input.
      : parseYaml(config.content) ?? {}
  } catch (err) {
    debug(`Could not parse ${config.archivePath}: ${err}`)
    return undefined
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined
  }

  const container = config.kind === 'package.json'
    ? (parsed as Record<string, any>).pnpm
    : parsed
  if (container === undefined || container === null) {
    return []
  }
  if (typeof container !== 'object' || Array.isArray(container)) {
    return undefined
  }

  const section = (container as Record<string, unknown>)[PATCHED_DEPENDENCIES]
  if (section === undefined || section === null) {
    return []
  }
  if (typeof section !== 'object' || Array.isArray(section)) {
    return undefined
  }

  const declarations: PatchDeclaration[] = []
  for (const [key, value] of Object.entries(section as Record<string, unknown>)) {
    // pnpm only accepts a path string here. Anything else is a config this
    // code does not understand, so it declines to touch the bundle at all.
    if (typeof value !== 'string') {
      return undefined
    }
    declarations.push({ key, patchPath: value })
  }
  return declarations
}

/**
 * Reads a lockfile's `patchedDependencies` section as key → patch hash.
 * pnpm 10 records `{ hash, path }` objects and pnpm 11 a bare hash string;
 * both are accepted. Returns `undefined` when the lockfile cannot be parsed.
 */
export function readLockfilePatchHashes (lockfileContent: string): Map<string, string> | undefined {
  let parsed: unknown
  try {
    parsed = parseYaml(lockfileContent)
  } catch (err) {
    debug(`Could not parse the lockfile: ${err}`)
    return undefined
  }

  const hashes = new Map<string, string>()
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined
  }

  const section = (parsed as Record<string, unknown>)[PATCHED_DEPENDENCIES]
  if (section === undefined || section === null) {
    return hashes
  }
  if (typeof section !== 'object' || Array.isArray(section)) {
    return undefined
  }

  for (const [key, value] of Object.entries(section as Record<string, any>)) {
    const hash = typeof value === 'string' ? value : value?.hash
    if (typeof hash !== 'string' || hash === '') {
      return undefined
    }
    hashes.set(key, hash)
  }
  return hashes
}

/**
 * Finds the single config whose `patchedDependencies` the bundle should be
 * filtered against, or `undefined` when there is nothing to do or the configs
 * cannot be used.
 *
 * Declining when more than one config declares a non-empty map is deliberate:
 * pnpm picks ONE site and ignores the other wholesale, and which site wins
 * depends on the pnpm major (10 prefers `package.json`, 11 ignores it
 * entirely). Editing the losing site is not merely useless — emptying the
 * winning one would promote the loser, changing which patches apply.
 */
function findDeclaringConfig (
  configs: PatchConfigFile[],
): { config: PatchConfigFile, declarations: PatchDeclaration[] } | undefined {
  const declaring: Array<{ config: PatchConfigFile, declarations: PatchDeclaration[] }> = []

  for (const config of configs) {
    const declarations = readPatchedDependencies(config)
    if (declarations === undefined) {
      return undefined
    }
    if (declarations.length > 0) {
      declaring.push({ config, declarations })
    }
  }

  if (declaring.length > 1) {
    debug('More than one config declares patchedDependencies; leaving the bundle alone')
    return undefined
  }

  return declaring[0]
}

/**
 * Whether a patch declaration still applies to something in `lockfileContent`.
 *
 * pnpm records the applied patch by hash: the `patchedDependencies` section
 * pins `key → hash`, and that hash reappears as `patch_hash=<hash>` in the
 * importer, snapshot and package entries of every package the patch was
 * applied to. A declaration that applies to nothing keeps its section entry —
 * the section mirrors the config, not the dependency graph — but its hash
 * appears nowhere else, which makes the marker the sole discriminator. A
 * whole-file search is safe because the section's own value never contains
 * the literal `patch_hash=`.
 */
function hasMarker (hash: string | undefined, lockfileContent: string): boolean {
  return hash !== undefined && lockfileContent.includes(`patch_hash=${hash}`)
}

/**
 * Whether the prune is what stopped a patch from applying.
 *
 * Deliberately differential rather than a bare absence test on the pruned
 * lockfile. Absence alone would mean that a lockfile this module cannot read
 * markers out of — a future pnpm that keeps the `9` version string but spells
 * them differently — reads as "nothing applies anywhere" and every declaration
 * is stripped at once, which is the one outcome the module exists to prevent.
 * Requiring the marker in the original first makes that case drop nothing.
 *
 * The pruned side falls back to the original's hash because a lockfile can
 * lose the `patchedDependencies` section while keeping its markers; without
 * the fallback such a patch would read as no longer applied.
 */
function droppedByPrune (
  key: string,
  prunedHashes: Map<string, string>,
  originalHashes: Map<string, string>,
  originalLockfileContent: string,
  prunedLockfileContent: string,
): boolean {
  const originalHash = originalHashes.get(key)
  if (!hasMarker(originalHash, originalLockfileContent)) {
    return false
  }
  return !hasMarker(prunedHashes.get(key) ?? originalHash, prunedLockfileContent)
}

/**
 * Resolves a declared patch path to its archive path, or `undefined` when it
 * escapes the workspace root (the archive's own root) and therefore does not
 * name a bundle entry this code may remove.
 */
function patchArchivePath (patchPath: string): string | undefined {
  // Traversal is judged on the path AS WRITTEN, before any normalization:
  // pathToPosix normalizes internally, which collapses `..` segments and would
  // hide a path that leaves the root and comes back
  // (`patches/sub/../../package.json` collapses to `package.json`, naming a
  // bundle file that is not a patch at all).
  if (patchPath.split(/[/\\]/).includes('..')) {
    return undefined
  }

  const normalized = pathToPosix(patchPath)
  if (path.posix.isAbsolute(normalized)) {
    return undefined
  }
  // `.` (what an empty path normalizes to) and a trailing slash name a
  // directory, not a patch file, so they must never reach a caller that
  // deletes bundle entries.
  if (normalized === '.' || normalized.endsWith('/')) {
    return undefined
  }
  // pathToPosix only rewrites the platform's own separator and strips C:/D:
  // drive prefixes, so a spelling from another platform can survive looking
  // relative yet still denote a path this comparison cannot align with.
  if (normalized.includes('\\') || /^[A-Za-z]:/.test(normalized)) {
    return undefined
  }
  return normalized
}

/**
 * Computes the patch declarations a bundle should stop shipping, together with
 * the rewritten files that carry the removal. Returns `undefined` whenever the
 * evidence is incomplete or an edit cannot be verified — the caller then ships
 * the bundle unchanged, which is always safe.
 */
export function planPatchFilter (options: PlanPatchFilterOptions): PatchFilterPlan | undefined {
  const { configs, originalLockfileContent, prunedLockfileContent } = options

  const declaring = findDeclaringConfig(configs)
  if (declaring === undefined) {
    return undefined
  }

  const originalHashes = readLockfilePatchHashes(originalLockfileContent)
  const prunedHashes = readLockfilePatchHashes(prunedLockfileContent)
  if (originalHashes === undefined || prunedHashes === undefined) {
    return undefined
  }

  const unusedKeys: string[] = []
  // Both sets hold ARCHIVE paths, never the raw spelling: two declarations can
  // point at one file with different spellings (`./patches/x.patch` and
  // `patches/x.patch`), and comparing raw strings would drop a file a
  // surviving declaration still needs.
  const keptArchivePaths = new Set<string>()
  const candidateArchivePaths = new Set<string>()
  // A surviving declaration whose path resolves outside the bundle root cannot
  // be compared against the in-root candidates at all, so no file is dropped
  // in that case. The declarations and lockfile entries still go; an
  // unreferenced patch file left in the bundle is inert.
  let keptPathEscapesRoot = false

  for (const declaration of declaring.declarations) {
    const archivePath = patchArchivePath(declaration.patchPath)

    // A key the project's own lockfile never recorded is no evidence of
    // anything: the pnpm that wrote it may simply not read the site the key
    // was declared in. Removing it would silently unpatch a dependency that a
    // different pnpm on the runner would patch.
    const recorded = originalHashes.has(declaration.key)
    if (!recorded) {
      debug(`Patch '${declaration.key}' is not recorded in the project's lockfile; leaving it alone`)
    }
    const dropped = recorded && droppedByPrune(
      declaration.key, prunedHashes, originalHashes, originalLockfileContent, prunedLockfileContent,
    )
    if (!dropped) {
      if (archivePath === undefined) {
        keptPathEscapesRoot = true
      } else {
        keptArchivePaths.add(archivePath)
      }
      continue
    }

    unusedKeys.push(declaration.key)
    if (archivePath === undefined) {
      debug(`Patch path '${declaration.patchPath}' resolves outside the bundle root; leaving it alone`)
    } else {
      candidateArchivePaths.add(archivePath)
    }
  }

  if (unusedKeys.length === 0) {
    return undefined
  }

  const removed = new Set(unusedKeys)

  const configContent = rewriteConfig(declaring.config, removed)
  if (configContent === undefined) {
    return undefined
  }
  const rewrittenConfig: RewrittenFile = {
    archivePath: declaring.config.archivePath,
    content: configContent,
  }

  const lockfileContent = rewriteYamlSection(prunedLockfileContent, removed)
  if (lockfileContent === undefined) {
    return undefined
  }

  // Two declarations may share a patch file; keep it while any survivor still
  // points at it.
  const droppedPatchPaths = keptPathEscapesRoot
    ? []
    : Array.from(candidateArchivePaths).filter(archivePath => !keptArchivePaths.has(archivePath))

  return { unusedKeys, rewrittenConfig, droppedPatchPaths, lockfileContent }
}

function rewriteConfig (config: PatchConfigFile, removed: Set<string>): string | undefined {
  return config.kind === 'package.json'
    ? rewritePackageJson(config.content, removed)
    : rewriteYamlSection(config.content, removed)
}

/**
 * Removes keys from a YAML document's top-level `patchedDependencies` map,
 * dropping the map itself once it empties. Shared by `pnpm-workspace.yaml` and
 * `pnpm-lock.yaml`, whose sections have the same shape.
 *
 * The result is verified structurally before it is returned: a serializer that
 * reformatted or dropped anything else would ship silently, and for the
 * lockfile it would also invalidate the verification the pruner already ran
 * over the bytes it produced.
 */
export function rewriteYamlSection (content: string, removed: Set<string>): string | undefined {
  // parseDocument collects syntax errors on the document rather than throwing,
  // so `errors` — not a try/catch — is what rejects malformed input here.
  const doc = parseDocument(content)
  if (doc.errors.length > 0) {
    debug(`Could not parse YAML for rewriting: ${doc.errors[0].message}`)
    return undefined
  }

  const section = doc.get(PATCHED_DEPENDENCIES)
  if (section === undefined || section === null) {
    // Nothing to delete. The prune can legitimately return a lockfile that
    // carries no section at all, in which case only the config needs editing.
    return content
  }
  if (!isMap(section)) {
    return undefined
  }

  for (const key of removed) {
    doc.deleteIn([PATCHED_DEPENDENCIES, key])
  }
  if (section.items.length === 0) {
    doc.delete(PATCHED_DEPENDENCIES)
  }

  const rewritten = doc.toString(YAML_STRINGIFY_OPTIONS)
  return verifyRewrite(content, rewritten, removed, parseYaml)
}

function rewritePackageJson (content: string, removed: Set<string>): string | undefined {
  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    debug(`Could not parse package.json for rewriting: ${err}`)
    return undefined
  }

  const section = parsed?.pnpm?.[PATCHED_DEPENDENCIES]
  if (section === null || typeof section !== 'object') {
    return undefined
  }

  for (const key of removed) {
    delete section[key]
  }
  if (Object.keys(section).length === 0) {
    delete parsed.pnpm[PATCHED_DEPENDENCIES]
  }

  // Unlike the YAML path, which is byte-preserving, this reformats the whole
  // manifest. The bundled copy is only ever an install input — nothing reads it
  // back as text — and matching the original's formatting would mean carrying a
  // JSON editor for no behavioral gain.
  const rewritten = JSON.stringify(parsed, null, 2)
  return verifyRewrite(content, rewritten, removed, JSON.parse)
}

/**
 * Asserts that a rewrite changed nothing but the intended keys, by comparing
 * the reparsed result against the reparsed original with those keys deleted.
 * A config can carry anything else pnpm understands — `catalog:`, `overrides`,
 * `onlyBuiltDependencies` — and nothing downstream would notice it being
 * mangled, so the check is what makes the edit safe to ship.
 *
 * Exported so that the rejection path — which no legitimate serializer output
 * reaches, and which therefore cannot be driven through the callers — is
 * directly testable.
 */
export function verifyRewrite (
  original: string,
  rewritten: string,
  removed: Set<string>,
  parse: (content: string) => any,
): string | undefined {
  let expected: any
  let actual: any
  try {
    expected = parse(original)
    actual = parse(rewritten)
  } catch (err) {
    debug(`Could not reparse a rewritten file for verification: ${err}`)
    return undefined
  }

  for (const container of [expected, expected?.pnpm]) {
    const section = container?.[PATCHED_DEPENDENCIES]
    if (section === null || typeof section !== 'object') {
      continue
    }
    for (const key of removed) {
      delete section[key]
    }
    if (Object.keys(section).length === 0) {
      delete container[PATCHED_DEPENDENCIES]
    }
  }

  if (!isDeepStrictEqual(expected, actual)) {
    debug('A rewritten file did not match the expected structure; leaving the bundle alone')
    return undefined
  }

  return rewritten
}

export interface FindUnrepairedPatchKeysOptions {
  configs: PatchConfigFile[]
  originalLockfileContent: string
  /** The lockfile the bundle is about to ship. */
  shippedLockfileContent: string
}

/**
 * Reports declarations the shipped bundle still carries but its shipped
 * lockfile no longer records — the precondition for the remote install failing
 * with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`.
 *
 * Scoped to keys the project's original lockfile recorded, so a declaration
 * the project's own pnpm never honoured is not reported as a bundling problem.
 */
export function findUnrepairedPatchKeys (options: FindUnrepairedPatchKeysOptions): string[] {
  const { configs, originalLockfileContent, shippedLockfileContent } = options

  const originalHashes = readLockfilePatchHashes(originalLockfileContent)
  const shippedHashes = readLockfilePatchHashes(shippedLockfileContent)
  if (originalHashes === undefined || shippedHashes === undefined) {
    return []
  }

  const unrepaired = new Set<string>()
  for (const config of configs) {
    for (const declaration of readPatchedDependencies(config) ?? []) {
      if (originalHashes.has(declaration.key) && !shippedHashes.has(declaration.key)) {
        unrepaired.add(declaration.key)
      }
    }
  }
  return Array.from(unrepaired).sort()
}
