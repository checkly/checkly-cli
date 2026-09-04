import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import Debug from 'debug'
import { execa, type Result } from 'execa'
import JSON5 from 'json5'
import { parse as parseYaml } from 'yaml'

import { createFauxPackageFiles } from './faux-package.js'
import { isPnpmfilePath } from './package-files/pnpmfile.js'
import { lineage } from './package-files/walk.js'
import { PackageManager, PathLookup, Runnable } from './package-files/package-manager.js'
import { Package, Workspace } from './package-files/workspace.js'
import { File, VirtualFile } from './parser.js'
import { redactUrl } from '../embedded-packages/diagnostics.js'
import { pathToPosix } from '../util.js'

const debug = Debug('checkly:cli:services:check-parser:lockfile-pruner')

export interface PruneBundledLockfileOptions {
  workspace: Workspace
  packageManager: PackageManager
  /**
   * The bundle's final file set, keyed by archive path (posix, relative to
   * the workspace root) — the bundler's own registry.
   */
  files: ReadonlyMap<string, File>
  /**
   * Archive paths of manifests the bundler rewrote from their on-disk
   * originals (`bundle.packages.prune`, patch filtering). Unlike a faux
   * manifest, a rewritten manifest carries the member's real content and
   * version fields, so it is safe to feed into resolution even for a
   * member whose version is unknown.
   */
  rewrittenManifests?: ReadonlySet<string>
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
}

export type PruneBundledLockfileResult =
  | {
    status: 'pruned'
    /** The lockfile's archive path. */
    archivePath: string
    /** The regenerated lockfile contents. */
    content: string
    /**
     * The workspace's lockfile as it was before pruning. Callers that compare
     * the two — the patch filtering does, to tell a declaration pnpm dropped
     * from one it never read — get the exact bytes this prune was computed
     * from rather than re-reading a file that may since have changed.
     */
    originalContent: string
    /**
     * Faux manifests synthesized for workspace members that bundled
     * manifests reference as links but that have no manifest in the bundle
     * (see {@link pruneBundledLockfile}). The caller must register these
     * into the bundle so that the bundle and the pruned lockfile stay
     * consistent.
     */
    backfilledManifests: VirtualFile[]
  }
  | {
    status: 'skipped'
    reason: string
    /**
     * True when the skip means "pruning was needed but is unavailable" —
     * the bundle is a partial workspace whose lockfile over-describes it,
     * yet this setup cannot be pruned. Callers should surface these; skips
     * where there is simply nothing to do stay quiet.
     */
    notable?: boolean
    /**
     * True when the skip itself proves the shipped lockfile matches the
     * bundle's manifests: the regeneration ran against them and produced
     * byte-identical content. Lets a caller that rewrote manifests keep
     * the rewrite instead of rolling it back.
     */
    consistent?: boolean
  }
  | { status: 'failed', reason: string }

// A legitimate prune reuses resolutions from the lockfile and takes seconds
// (measured 1-4s even against multi-thousand-package lockfiles); only a
// stale lockfile behind an unreachable registry runs long, and that path
// ends in a fallback anyway because the subset check rejects fresh
// resolutions — so waiting minutes buys nothing.
const DEFAULT_TIMEOUT_MS = 30_000

// A pre-install probe (yarn's version check, pnpm's store lookup) shares
// the install's budget, see PruneBudget; if it leaves the install less than
// this, the prune is abandoned with a message naming the probe rather than
// spawning an install doomed to time out.
const PROBE_MIN_INSTALL_BUDGET_MS = 1_000

/** What a prune spawn yields: execa's non-rejecting result with string streams. */
type ChildResult = Result<{ reject: false }>

/**
 * The prune's time budget, shared between the pre-install probes (yarn's
 * version check, pnpm's store lookup) and the install itself, so the prune
 * cannot block for longer than the documented timeout in total — a stalled
 * first-use corepack download would otherwise be paid once per spawn. A
 * total of 0 means "no timeout" (execa's own semantics), so nothing is
 * ever exhausted then.
 */
class PruneBudget {
  #spentMs = 0

  constructor (readonly totalMs: number) {}

  /**
   * execa timeout for the next spawn. Never 0 for a bounded budget: execa
   * would read that as "no timeout".
   */
  get remainingMs (): number {
    if (this.totalMs === 0) {
      return 0
    }
    return Math.max(this.totalMs - this.#spentMs, 1)
  }

  /**
   * Whether a bounded budget has less than the install floor left, in
   * which case spawning the install would only produce a misleading
   * ~zero-length timeout.
   */
  get belowFloor (): boolean {
    return this.totalMs > 0 && this.totalMs - this.#spentMs < PROBE_MIN_INSTALL_BUDGET_MS
  }

  /**
   * Spawns a child within the remaining budget and charges its wall-clock
   * time. The timeout is read before the clock starts, so the first spawn
   * reports exactly the configured budget when it times out. Returned
   * alongside the result for that message.
   */
  async spawn (
    runnable: Runnable,
    options: { cwd: string, env: NodeJS.ProcessEnv },
  ): Promise<{ result: ChildResult, timeoutMs: number }> {
    const timeoutMs = this.remainingMs
    const startedAt = Date.now()
    const result = await execa(runnable.executable, runnable.args, {
      cwd: options.cwd,
      env: options.env,
      extendEnv: false,
      timeout: timeoutMs,
      reject: false,
    })
    this.#spentMs += Date.now() - startedAt
    return { result, timeoutMs }
  }
}

const MAX_FAILURE_DETAIL_LENGTH = 400

// Cap for the child's partial output logged at debug level when a prune
// times out. Generous enough to reach the stalled request past pnpm's
// progress lines, bounded so a chatty child cannot flood the log.
const MAX_DEBUG_OUTPUT_LENGTH = 8_192

const TIMEOUT_HINT = 'set CHECKLY_LOCKFILE_PRUNE_TIMEOUT=<seconds> to raise it'

// Node's timers cannot represent a delay beyond 2^31-1 ms and would clamp a
// larger one to 1 ms, turning a "raise the budget" request into an instant
// timeout, so anything past that is rejected as unusable.
const MAX_TIMEOUT_SECONDS = Math.floor(2_147_483_647 / 1000)

/**
 * Reads the prune time budget from CHECKLY_LOCKFILE_PRUNE_TIMEOUT, given in
 * whole seconds; `0` disables the timeout (execa's own semantics). Anything
 * else (unset, empty, negative, fractional, non-numeric, too large) yields
 * undefined so the caller falls back to the default; an unusable value is
 * only noted on the debug channel, since it cannot make a prune fail.
 */
function timeoutFromEnv (env: NodeJS.ProcessEnv): number | undefined {
  const raw = env.CHECKLY_LOCKFILE_PRUNE_TIMEOUT
  if (raw === undefined || raw === '') {
    return undefined
  }
  if (!/^\d+$/.test(raw) || Number(raw) > MAX_TIMEOUT_SECONDS) {
    debug(`Ignoring CHECKLY_LOCKFILE_PRUNE_TIMEOUT=${JSON.stringify(raw)}: not a whole number of seconds`
      + ` up to ${MAX_TIMEOUT_SECONDS}`)
    return undefined
  }
  return Number(raw) * 1000
}

/** Whole seconds where possible, so the reason matches the env var's unit. */
function formatBudget (timeoutMs: number): string {
  return timeoutMs % 1000 === 0 ? `${timeoutMs / 1000}s` : `${timeoutMs}ms`
}

/**
 * Environment keys that alter the very behavior the prune command pins with
 * explicit flags. Everything else (registry and auth configuration in
 * particular) is passed through.
 */
const STRIPPED_ENV_KEYS = new Set([
  'npm_config_frozen_lockfile',
  'npm_config_lockfile',
  'npm_config_package_lock',
  'npm_config_dry_run',
  'npm_config_ignore_workspace',
  // Redirects the lockfile write outside the temp dir. The explicit
  // --lockfile-dir flag on the pnpm command outranks this anyway; stripped
  // as defense in depth.
  'npm_config_lockfile_dir',
])

/**
 * A workspace package's manifest path in the archive, posix-relative to
 * the workspace root — the keying the bundler's file map uses. Exported so
 * the bundler's manifest pruning derives identical keys; the
 * `rewrittenManifests` set is matched against these.
 */
export function manifestArchivePath (workspace: Workspace, pkg: Package): string {
  return pathToPosix(path.relative(workspace.root.path, pkg.packageJsonPath))
}

function unknownVersionReason (pkg: Package): string {
  return `the version of workspace package '${pkg.name}' could not be determined`
}

/** The workspace lockfile's archive path, when the workspace has one. */
export function lockfileArchivePath (workspace: Workspace): string | undefined {
  if (!workspace.lockfile.isOk()) {
    return undefined
  }
  return pathToPosix(path.relative(workspace.root.path, workspace.lockfile.unwrap()))
}

export type ShouldPruneResult =
  | { prune: true, lockfileArchivePath: string }
  | { prune: false, reason: string, notable?: boolean }

/**
 * Decides whether the bundle's lockfile needs pruning at all. Pruning only
 * matters when the bundle differs from the full workspace — when every
 * workspace member's real manifest is in the bundle, the original lockfile
 * already describes the bundle exactly.
 */
export function shouldPruneLockfile (
  workspace: Workspace,
  files: ReadonlyMap<string, File>,
  env: NodeJS.ProcessEnv = process.env,
  rewrittenManifests: ReadonlySet<string> = new Set(),
): ShouldPruneResult {
  // '0' is the documented spelling; 'false' is a tolerated alias for the
  // common boolean-env habit and must keep working.
  if (env.CHECKLY_LOCKFILE_PRUNE === '0' || env.CHECKLY_LOCKFILE_PRUNE === 'false') {
    return { prune: false, reason: `disabled via CHECKLY_LOCKFILE_PRUNE=${env.CHECKLY_LOCKFILE_PRUNE}` }
  }

  const archivePath = lockfileArchivePath(workspace)
  if (archivePath === undefined) {
    return { prune: false, reason: 'the workspace has no lockfile' }
  }

  const lockfileEntry = files.get(archivePath)
  if (lockfileEntry === undefined) {
    return { prune: false, reason: 'the bundle does not contain the lockfile' }
  }

  let bundleMatchesWorkspace = true
  for (const pkg of [workspace.root, ...workspace.packages]) {
    const archivePath = manifestArchivePath(workspace, pkg)
    const manifest = files.get(archivePath)
    if (manifest === undefined || !manifest.physical) {
      bundleMatchesWorkspace = false
    }
    // A faux manifest for a member with an unknown version carries the
    // 0.0.0 fallback, which could make specifiers resolve differently than
    // they did for the user; do not feed it into resolution. A manifest
    // the bundler rewrote from its on-disk original is exempt: it carries
    // the member's real content, version field included (or legitimately
    // absent, as on most workspace roots).
    if (
      manifest !== undefined
      && !manifest.physical
      && pkg.version === undefined
      && !rewrittenManifests.has(archivePath)
    ) {
      return { prune: false, reason: unknownVersionReason(pkg), notable: true }
    }
  }

  if (bundleMatchesWorkspace) {
    return { prune: false, reason: 'the bundle contains the full workspace' }
  }

  return { prune: true, lockfileArchivePath: archivePath }
}

// Deliberately NOT materialized: .yarnrc.yml (and bunfig.toml). Both can
// hold registry auth secrets and neither is part of the bundle today. For
// yarn the omission is verified safe for --mode=update-lockfile: Berry
// lockfiles are registry-agnostic (npm: protocol, content checksums — no
// URLs to rewrite), locked git entries reuse without approvedGitRepositories,
// packageExtensions does not change entry serialization, and any resolution
// that WOULD need registry config is blocked by the child env's network
// guard and fails closed.
const MATERIALIZED_BASENAMES = new Set(['package.json', '.npmrc', 'pnpm-workspace.yaml'])

/**
 * Selects the bundle entries that affect dependency resolution: manifests,
 * package manager configuration, patches and the lockfile itself. This
 * deliberately mirrors what the remote install will see, so the pruned
 * lockfile matches the remote install's inputs.
 */
export function selectMaterializationEntries (
  files: ReadonlyMap<string, File>,
  lockfileArchivePath: string,
): Array<[string, File]> {
  const selected: Array<[string, File]> = []

  for (const [archivePath, file] of files) {
    // The lockfile is always selected — without it the "regeneration" would
    // be a from-scratch registry resolution. (Even for a symlink entry, the
    // materialization copies the file the entry's own path points at.)
    if (archivePath === lockfileArchivePath) {
      selected.push([archivePath, file])
      continue
    }

    if (file.physical && file.symlinkTarget !== undefined) {
      continue
    }

    const segments = archivePath.split('/')
    // Entries can resolve outside the workspace root (a '..' archive path) —
    // never write those into the temp dir. node_modules content and embedded
    // package tarballs play no part in lockfile resolution.
    if (segments.includes('..') || segments.includes('node_modules')) {
      continue
    }
    if (segments[0] === '.checkly') {
      continue
    }

    const basename = segments[segments.length - 1]
    if (
      MATERIALIZED_BASENAMES.has(basename)
      || isPnpmfilePath(basename)
      || basename.endsWith('.patch')
    ) {
      selected.push([archivePath, file])
    }
  }

  return selected
}

interface LockfileEdge {
  /** Bare package name of the dependency. */
  name: string
  /** Whether the edge resolves to a workspace link. */
  isLink: boolean
}

/**
 * The parts of a lockfile the pruner reasons about, format-agnostic: every
 * dependency edge (keyed uniquely per format), every resolution entry, the
 * importer set and pnpm's recorded settings.
 */
interface LockfileSnapshot {
  lockfileVersion?: string
  /**
   * Yarn Berry's checksum-scheme identifier (`__metadata.cacheKey`).
   * Optional on BOTH sides even within one lockfile generation: yarn 3
   * omits it when the lockfile resolves no registry packages, so it is
   * only compared when both snapshots record one.
   */
  cacheKey?: string
  pnpmfileChecksum?: string
  excludeLinksFromLockfile: boolean
  /** Dependency edges by a format-specific unique key. */
  edges: Map<string, LockfileEdge>
  /**
   * Resolution entries: key → recorded version (or empty when the key
   * itself pins the version, as in pnpm). Used for the subset check.
   */
  resolutions: Map<string, string>
  /** Importer directories, relative to the root ('.' for the root itself). */
  importers: Set<string>
}

class UnsupportedLockfileFormatError extends Error {}

// Yarn Berry lockfile metadata versions this parser handles, mapped to the
// yarn major that writes them — the parser allowlist and the
// generation-mismatch check both derive from this one table so adding a
// version cannot leave them out of sync. Version 6 is yarn 3; 8 (early
// yarn 4) and 10 (current) are yarn 4. 6 records dependency specs without
// the npm: protocol prefix; 8+ record it.
const YARN_METADATA_VERSION_TO_MAJOR: Record<string, number> = { 6: 3, 8: 4, 10: 4 }

const PNPM_DEPENDENCY_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies']

// Manifests can also reference a workspace member through peerDependencies
// (plugin-style monorepos), even though lockfile importer sections do not
// have a peer group of their own.
const MANIFEST_DEPENDENCY_GROUPS = [...PNPM_DEPENDENCY_GROUPS, 'peerDependencies']

function parseLockfileSnapshot (content: string, lockfileName: string): LockfileSnapshot {
  const snapshot: LockfileSnapshot = {
    excludeLinksFromLockfile: false,
    edges: new Map(),
    resolutions: new Map(),
    importers: new Set(),
  }

  if (lockfileName === 'pnpm-lock.yaml') {
    const doc = parseYaml(content)
    if (doc === null || typeof doc !== 'object') {
      throw new UnsupportedLockfileFormatError(`could not parse ${lockfileName}`)
    }
    snapshot.lockfileVersion = doc.lockfileVersion !== undefined ? String(doc.lockfileVersion) : undefined
    // Fail closed on unknown formats: a future pnpm schema could rename the
    // sections this parser reads, silently emptying every check.
    const pnpmMajor = snapshot.lockfileVersion?.split('.')[0]
    if (pnpmMajor === undefined || !['6', '9'].includes(pnpmMajor)) {
      throw new UnsupportedLockfileFormatError(
        `unsupported ${lockfileName} version ${snapshot.lockfileVersion}`,
      )
    }
    snapshot.pnpmfileChecksum = typeof doc.pnpmfileChecksum === 'string' ? doc.pnpmfileChecksum : undefined
    snapshot.excludeLinksFromLockfile = doc.settings?.excludeLinksFromLockfile === true

    for (const [importer, groups] of Object.entries<any>(doc.importers ?? {})) {
      snapshot.importers.add(importer)
      if (groups === null || typeof groups !== 'object') {
        continue
      }
      for (const group of PNPM_DEPENDENCY_GROUPS) {
        const entries = groups[group]
        if (entries === null || typeof entries !== 'object') {
          continue
        }
        for (const [name, entry] of Object.entries<any>(entries)) {
          // v9 entries are `{ specifier, version }` objects; older formats
          // use a plain version string.
          const version = typeof entry === 'string' ? entry : entry?.version
          if (typeof version !== 'string') {
            continue
          }
          snapshot.edges.set(`${importer}\0${group}\0${name}`, {
            name,
            isLink: version.startsWith('link:'),
          })
        }
      }
    }

    // Package keys pin exact versions (and peer suffixes), so presence alone
    // is what the subset check needs.
    for (const section of ['packages', 'snapshots']) {
      for (const key of Object.keys(doc[section] ?? {})) {
        snapshot.resolutions.set(`${section}\0${key}`, '')
      }
    }

    return snapshot
  }

  if (lockfileName === 'package-lock.json') {
    let doc: any
    try {
      doc = JSON.parse(content)
    } catch {
      throw new UnsupportedLockfileFormatError(`could not parse ${lockfileName}`)
    }
    snapshot.lockfileVersion = doc?.lockfileVersion !== undefined ? String(doc.lockfileVersion) : undefined
    const packages = doc?.packages
    // lockfileVersion 1 has no `packages` section; without it neither the
    // link check nor the subset check can see anything. Unknown future
    // versions fail closed for the same reason.
    if (
      !['2', '3'].includes(snapshot.lockfileVersion ?? '')
      || packages === null || typeof packages !== 'object'
    ) {
      throw new UnsupportedLockfileFormatError(
        `unsupported ${lockfileName} version ${snapshot.lockfileVersion}`,
      )
    }

    for (const [key, entry] of Object.entries<any>(packages)) {
      if (entry === null || typeof entry !== 'object') {
        continue
      }
      const nodeModulesIndex = key.lastIndexOf('node_modules/')
      if (nodeModulesIndex === -1) {
        // The root project's entry is keyed '' in package-lock.json;
        // normalize to '.' so the importer-preservation check treats it
        // like pnpm's root importer.
        snapshot.importers.add(key === '' ? '.' : key)
        continue
      }
      // Covers nested installs too (`packages/a/node_modules/foo`), which
      // npm emits when a member's version conflicts with a hoisted one.
      const name = key.slice(nodeModulesIndex + 'node_modules/'.length)
      snapshot.edges.set(key, {
        name,
        isLink: entry.link === true,
      })
      if (entry.link !== true) {
        snapshot.resolutions.set(key, String(entry.version ?? entry.resolved ?? ''))
      }
    }

    return snapshot
  }

  if (lockfileName === 'bun.lock') {
    // bun.lock is JSONC (bun writes trailing commas), hence JSON5.
    let doc: any
    try {
      doc = JSON5.parse(content)
    } catch {
      throw new UnsupportedLockfileFormatError(`could not parse ${lockfileName}`)
    }
    const version = doc?.lockfileVersion !== undefined ? String(doc.lockfileVersion) : undefined
    const workspaces = doc?.workspaces
    const packages = doc?.packages
    // Fail closed on unknown formats, like the parsers above.
    if (
      version !== '1'
      || workspaces === null || typeof workspaces !== 'object'
      || packages === null || typeof packages !== 'object'
    ) {
      throw new UnsupportedLockfileFormatError(
        `unsupported ${lockfileName} version ${version}`,
      )
    }
    // configVersion is folded into the version so the verification step also
    // catches a regeneration that changed it. Bun preserves an existing value
    // and treats an absent one as 0 rather than upgrading it, so the fold is
    // stable for lockfiles written by older bun versions too. The format is
    // self-describing because the value surfaces verbatim in the "lockfile
    // version changed" failure reason.
    snapshot.lockfileVersion = `${version} (configVersion ${doc.configVersion ?? 0})`

    // A dependency edge resolves to a workspace link if either its spec says
    // so or the package entry it resolves to is a workspace tuple; the latter
    // covers bare semver specs that bun resolved to a workspace member. The
    // entry must be resolved per edge — member-scoped key first, hoisted key
    // second, as in parseBunLockfileVersion — because a workspace member's
    // name may also be consumed from the registry by a different importer,
    // and a name-global answer would misclassify one of the two edges.
    const resolvesToWorkspace = (memberName: unknown, depName: string): boolean => {
      const keys = typeof memberName === 'string' && memberName !== ''
        ? [`${memberName}/${depName}`, depName]
        : [depName]
      for (const key of keys) {
        const tuple = packages[key]
        if (Array.isArray(tuple) && typeof tuple[0] === 'string') {
          return tuple[0].includes('@workspace:')
        }
      }
      return false
    }

    for (const [dir, entry] of Object.entries<any>(workspaces)) {
      // The root importer is keyed '' in bun.lock; normalize to '.' so the
      // importer-preservation check treats it like pnpm's root importer.
      const importer = dir === '' ? '.' : dir
      snapshot.importers.add(importer)
      if (entry === null || typeof entry !== 'object') {
        continue
      }
      // Unlike pnpm importers, bun workspace entries mirror all four manifest
      // dependency groups, peerDependencies included.
      for (const group of MANIFEST_DEPENDENCY_GROUPS) {
        const entries = entry[group]
        if (entries === null || typeof entries !== 'object') {
          continue
        }
        for (const [name, spec] of Object.entries(entries)) {
          if (typeof spec !== 'string') {
            continue
          }
          snapshot.edges.set(`${importer}\0${group}\0${name}`, {
            name,
            isLink: spec.startsWith('workspace:')
              || spec.startsWith('link:')
              || resolvesToWorkspace(entry.name, name),
          })
        }
      }
    }

    // Package values are resolution tuples (name@version, then registry URL,
    // dependencies and integrity in a kind-dependent arity). Key the subset
    // check by the whole serialized tuple rather than by the lockfile key:
    // pruning the member that owns a hoisted key re-keys the surviving
    // member-scoped entry (e.g. `b/ms` becomes `ms`) with an unchanged tuple,
    // which a key-based check would falsely reject — while any change WITHIN
    // a tuple (a registry rewrite of the tarball URL, a version bump) must
    // still fail the check. Serialization is stable because both sides are
    // parsed from bun's own deterministic output by this same function.
    for (const tuple of Object.values(packages)) {
      snapshot.resolutions.set(JSON.stringify(tuple), '')
    }

    return snapshot
  }

  if (lockfileName === 'yarn.lock') {
    // Yarn Classic (v1) files must be recognized BEFORE the YAML parse:
    // realistic Classic lockfiles do not parse as YAML at all (an entry
    // with a nested `dependencies:` block mixes plain scalars and a
    // mapping, which the parser rejects), so without the header check a
    // Classic user would get a "could not parse" message implying a broken
    // lockfile. Every yarn-1-generated lockfile carries this header.
    if (/^# yarn lockfile v1$/m.test(content)) {
      throw new UnsupportedLockfileFormatError(
        `${lockfileName} is a Yarn Classic (v1) lockfile, which is not supported`,
      )
    }
    let doc: any
    try {
      // The failsafe schema keeps every scalar a string: yarn 3 writes
      // bare numeric ranges unquoted (`two: 2`), which the default schema
      // would coerce to numbers — dropping those edges (and losing `1.0`
      // as written, so String() could not undo it).
      doc = parseYaml(content, { schema: 'failsafe' })
    } catch {
      throw new UnsupportedLockfileFormatError(`could not parse ${lockfileName}`)
    }
    if (doc === null || typeof doc !== 'object') {
      throw new UnsupportedLockfileFormatError(`could not parse ${lockfileName}`)
    }
    const metadata = doc.__metadata
    if (metadata === null || typeof metadata !== 'object' || metadata.version === undefined) {
      throw new UnsupportedLockfileFormatError(
        `${lockfileName} is not a Yarn Berry lockfile (Yarn Classic lockfiles are not supported)`,
      )
    }
    // Fail closed on unknown metadata versions, like the parsers above
    // (see YARN_METADATA_VERSION_TO_MAJOR).
    const version = String(metadata.version)
    // hasOwnProperty, not `in`: a corrupted lockfile whose version equals an
    // Object.prototype key ('toString', '__proto__') must still fail closed.
    if (!Object.prototype.hasOwnProperty.call(YARN_METADATA_VERSION_TO_MAJOR, version)) {
      throw new UnsupportedLockfileFormatError(
        `unsupported ${lockfileName} metadata version ${version}`,
      )
    }
    snapshot.lockfileVersion = version
    // The cacheKey names the checksum scheme; a regeneration under a
    // different scheme must fail verification. Compared as its own field —
    // not folded into the version — because yarn 3 omits cacheKey entirely
    // when a lockfile resolves no registry packages, so a prune that
    // removes the last registry entry legitimately goes from "cacheKey: 8"
    // to no cacheKey at all.
    snapshot.cacheKey = metadata.cacheKey !== undefined ? String(metadata.cacheKey) : undefined

    // First pass: validate the entry shape and collect the descriptors (the
    // comma-joined parts of each entry key) that name workspace entries, so
    // edges can be classified per descriptor below. Splitting on ', ' is
    // safe: npm semver ranges cannot contain a comma, and yarn itself joins
    // descriptor lists with this exact separator.
    const workspaceDescriptors = new Set<string>()
    const entries: Array<[string, any]> = []
    for (const [key, entry] of Object.entries<any>(doc)) {
      if (key === '__metadata') {
        continue
      }
      if (entry === null || typeof entry !== 'object' || typeof entry.resolution !== 'string') {
        throw new UnsupportedLockfileFormatError(
          `unsupported ${lockfileName} entry shape for '${key}'`,
        )
      }
      entries.push([key, entry])
      if (entry.resolution.includes('@workspace:')) {
        for (const descriptor of key.split(', ')) {
          workspaceDescriptors.add(descriptor)
        }
      }
    }

    // A regular dependency edge resolves to a workspace link if either its
    // spec says so or its descriptor is one the lockfile keys a workspace
    // entry under; the latter covers bare semver specs that yarn resolved
    // to a workspace member (the member's entry is then keyed under both
    // the range descriptor and the workspace descriptor). Classified per
    // descriptor, because a member's name may also be consumed from the
    // registry by a different importer. The spec is probed as written —
    // metadata version 6 records `^1.0.0` where 8+ record `npm:^1.0.0`,
    // and the keys follow the same convention, so no prefix juggling is
    // needed. Peer edges are deliberately NEVER probed: a peer only shares
    // a descriptor with some other importer's real dependency, and pruning
    // that importer away legitimately removes the descriptor — probing
    // would then classify the surviving peer edge as a link that
    // "degraded", failing a correct prune. Peers are never resolved on
    // their own (the consumer's ancestors provide them), so there is no
    // silent-substitution channel to catch either; a `workspace:` peer
    // spec still counts as a link via its prefix.
    const resolvesToWorkspace = (name: string, spec: string): boolean => {
      return workspaceDescriptors.has(`${name}@${spec}`)
    }

    for (const [, entry] of entries) {
      const resolution: string = entry.resolution
      // lastIndexOf, not a simple split: scoped names contain '@'.
      const workspaceMarker = resolution.lastIndexOf('@workspace:')
      if (workspaceMarker === -1) {
        // Non-workspace entries (registry, git, patch, portal, ...) feed the
        // subset check. Key it by the whole serialized entry rather than the
        // lockfile key: pruning a consumer shrinks a multi-descriptor key
        // (e.g. "b@npm:^1.0.0, b@workspace:packages/b" loses its npm range)
        // with an unchanged value, which a key-based check would falsely
        // reject — while any change WITHIN an entry (version, checksum,
        // dependencies) must still fail the check. Serialization is stable
        // because both sides are parsed from yarn's own deterministic
        // output by this same function.
        snapshot.resolutions.set(JSON.stringify(entry), '')
        continue
      }
      // Workspace entries are the importers: their resolution carries the
      // member directory ('.' for the root), and their dependencies maps
      // carry the importer's edges — devDependencies and
      // optionalDependencies are merged into `dependencies` by yarn, and
      // peerDependencies stays its own group. Their content changes when a
      // member is shimmed, which is exactly what pruning does, so they must
      // NOT feed the subset check above.
      const importer = resolution.slice(workspaceMarker + '@workspace:'.length)
      snapshot.importers.add(importer)
      for (const group of ['dependencies', 'peerDependencies']) {
        const dependencies = entry[group]
        if (dependencies === null || typeof dependencies !== 'object') {
          continue
        }
        for (const [name, spec] of Object.entries(dependencies)) {
          if (typeof spec !== 'string') {
            continue
          }
          snapshot.edges.set(`${importer}\0${group}\0${name}`, {
            name,
            isLink: spec.startsWith('workspace:')
              || spec.startsWith('link:')
              || spec.startsWith('portal:')
              // Descriptor probing is for regular dependencies only — see
              // resolvesToWorkspace above for why peers must not probe.
              || (group === 'dependencies' && resolvesToWorkspace(name, spec)),
          })
        }
      }
    }

    return snapshot
  }

  if (lockfileName === 'bun.lockb') {
    throw new UnsupportedLockfileFormatError(
      'the binary bun.lockb format is not supported;'
      + ' regenerate a text lockfile with `bun install --save-text-lockfile`',
    )
  }

  throw new UnsupportedLockfileFormatError(`unsupported lockfile ${lockfileName}`)
}

/**
 * Verifies that the regenerated lockfile is a pruned copy of the original
 * rather than a (partial) re-resolution. Returns a failure reason, or
 * undefined when everything checks out.
 */
function verifyPrunedLockfile (
  original: LockfileSnapshot,
  regenerated: LockfileSnapshot,
  files: ReadonlyMap<string, File>,
): string | undefined {
  // A changed lockfile format version means the package manager rewrote the
  // file wholesale (e.g. a newer pnpm "upgrading" an old lockfile), which is
  // a full re-resolution.
  if (original.lockfileVersion !== regenerated.lockfileVersion) {
    return `the lockfile version changed from ${original.lockfileVersion} to ${regenerated.lockfileVersion}`
  }

  // A changed yarn checksum scheme means every checksum was rewritten —
  // a wholesale regeneration, not a prune. Only compared when both sides
  // record one: yarn 3 omits the cacheKey when a lockfile resolves no
  // registry packages, which a prune can legitimately arrive at.
  if (
    original.cacheKey !== undefined && regenerated.cacheKey !== undefined
    && original.cacheKey !== regenerated.cacheKey
  ) {
    return `the lockfile cacheKey changed from ${original.cacheKey} to ${regenerated.cacheKey}`
  }

  // Any change to the recorded pnpmfile checksum means the resolve ran with
  // different pnpm hooks than the user's own install.
  if (original.pnpmfileChecksum !== regenerated.pnpmfileChecksum) {
    return 'the regenerated lockfile records a different pnpmfile checksum than the original'
  }

  // Pruning only removes: every resolution in the regenerated lockfile must
  // already exist in the original. A new or changed resolution means the
  // lockfile was out of date with the bundled manifests and the package
  // manager resolved something fresh from the registry — versions the user
  // never installed or tested with.
  for (const [key, version] of regenerated.resolutions) {
    if (original.resolutions.get(key) !== version) {
      return `the regenerated lockfile resolves entries not present in the original `
        + `(is the lockfile out of date with package.json?)`
    }
  }

  // Every dependency edge that was a workspace link and that still exists
  // must still be a link. Catches npm's silent registry substitution (a
  // member whose version does not satisfy a range is fetched from the
  // registry with exit code 0).
  for (const [key, edge] of original.edges) {
    if (!edge.isLink) {
      continue
    }
    const after = regenerated.edges.get(key)
    if (after !== undefined && !after.isLink) {
      return `'${edge.name}' is no longer a workspace link`
    }
  }

  // Importers may only disappear for members absent from the bundle. Losing
  // an importer whose manifest IS bundled would make the remote (frozen)
  // install see an importer the lockfile lacks.
  for (const importer of original.importers) {
    if (regenerated.importers.has(importer)) {
      continue
    }
    const manifestPath = importer === '.' ? 'package.json' : `${importer}/package.json`
    if (files.has(manifestPath)) {
      return `the regenerated lockfile lost the importer '${importer}' whose manifest is bundled`
    }
  }
}

type BackfillResult =
  | { manifests: Map<string, VirtualFile> }
  | { skipReason: string }

/**
 * Synthesizes faux manifests for workspace members that selected manifests
 * reference as links (via the `workspace:` protocol, or resolved as links in
 * the original lockfile) but that have no manifest among the selected
 * entries. Without these the temp-dir resolve would fail (pnpm) or silently
 * resolve the member from the registry (npm) — and, crucially, the same
 * would happen during the remote install, so the caller must also register
 * the returned manifests into the bundle.
 */
async function collectBackfilledManifests (
  workspace: Workspace,
  selected: Array<[string, File]>,
  original: LockfileSnapshot,
): Promise<BackfillResult> {
  const linkedNames = new Set<string>()
  for (const edge of original.edges.values()) {
    if (edge.isLink) {
      linkedNames.add(edge.name)
    }
  }

  const manifestEntries = selected.filter(
    ([archivePath]) => path.posix.basename(archivePath) === 'package.json',
  )
  const presentManifestPaths = new Set(manifestEntries.map(([archivePath]) => archivePath))

  const backfilled = new Map<string, VirtualFile>()

  for (const [, file] of manifestEntries) {
    let manifest: any
    try {
      const content = file.physical
        ? await fs.readFile(file.filePath, 'utf8')
        : file.content
      manifest = JSON.parse(content)
    } catch {
      continue
    }

    for (const group of MANIFEST_DEPENDENCY_GROUPS) {
      const entries = manifest?.[group]
      if (entries === null || typeof entries !== 'object') {
        continue
      }
      for (const [name, spec] of Object.entries<any>(entries)) {
        const member = workspace.memberByName(name)
        if (member === undefined || member === workspace.root) {
          continue
        }
        // Optional peers (peerDependenciesMeta.optional) are deliberately NOT
        // exempted: pnpm resolves a `workspace:` peer spec regardless of the
        // optional flag when auto-install-peers is on (the default), so a
        // missing manifest fails the install outright.
        const isLink = (typeof spec === 'string' && spec.startsWith('workspace:'))
          || linkedNames.has(name)
        if (!isLink) {
          continue
        }
        const memberManifestPath = manifestArchivePath(workspace, member)
        if (presentManifestPaths.has(memberManifestPath) || backfilled.has(memberManifestPath)) {
          continue
        }
        // Same rule as in shouldPruneLockfile: never feed the 0.0.0 fallback
        // version into resolution.
        if (member.version === undefined) {
          return { skipReason: unknownVersionReason(member) }
        }
        for (const fauxFile of createFauxPackageFiles(member)) {
          backfilled.set(
            pathToPosix(path.relative(workspace.root.path, fauxFile.filePath)),
            fauxFile,
          )
        }
      }
    }
  }

  return { manifests: backfilled }
}

function buildChildEnv (baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(baseEnv)) {
    if (STRIPPED_ENV_KEYS.has(key.toLowerCase())) {
      continue
    }
    env[key] = value
  }
  // The temp project's root package.json may pin a different package manager
  // than the one being invoked; relax corepack's mismatch error (this does
  // not affect corepack's pinned-version resolution).
  env.COREPACK_ENABLE_STRICT = '0'
  // A legitimate yarn prune needs no network at all (verified even with a
  // cold cache: the fetch step only touches entries that are NEW, which a
  // prune never introduces) — but a lockfile that is out of date with a
  // manifest would make yarn resolve the missing descriptor against its
  // configured registry, and since the project's .yarnrc.yml is not
  // materialized (see MATERIALIZED_BASENAMES) that is the PUBLIC registry:
  // the request would disclose the (possibly private) package name before
  // the subset verification could reject the result. Disabling the network
  // makes that case fail fast with yarn's own blocked-request error
  // instead. Only Yarn Berry reads this variable, and every Berry
  // generation accepts it (unlike YARN_ENABLE_HARDENED_MODE, which is set
  // per-run once the yarn generation is known).
  env.YARN_ENABLE_NETWORK = '0'
  // Yarn honors a .yarnrc.yml (Berry) or .yarnrc (Classic) found in ANY
  // ancestor of its working directory — for the prune temp dir that means
  // the system temp root and everything above it, none of which this
  // process controls (on shared hosts /tmp is world-writable). An ancestor
  // rc can redirect the lockfile write (lockfileFilename), re-enable what
  // the variables above disable, or worst of all execute an arbitrary
  // script via yarnPath/yarn-path — during the version probe already. Two
  // independent guards, because one alone is insufficient:
  //   - YARN_IGNORE_PATH neutralizes yarnPath/yarn-path specifically, and
  //     is the ONLY mechanism that covers Yarn Classic (which ignores
  //     YARN_RC_FILENAME and has no env-settable rc path). Verified to
  //     disable the exploit on 1.22.22, 3.8.7 and 4.18.0.
  //   - YARN_RC_FILENAME points Berry's rc lookup at a per-invocation
  //     random name so no ancestor rc is read at all (blocking
  //     lockfileFilename etc., not just yarnPath). It must be random: a
  //     fixed name is a compile-time constant an attacker can pre-create
  //     to re-open the channel.
  env.YARN_IGNORE_PATH = '1'
  env.YARN_RC_FILENAME = `.checkly-lockfile-prune-no-rc-${randomUUID()}.yml`
  // The link step (where lifecycle scripts run) is already skipped by
  // --mode=update-lockfile; disabling scripts outright is defense in
  // depth, and enableScripts exists in every Berry generation.
  env.YARN_ENABLE_SCRIPTS = '0'
  return env
}

/**
 * Scrubs credentials from package manager output before it is surfaced
 * anywhere. Every http(s) URL is collapsed to scheme and host by
 * `redactUrl`: registries carry tokens in userinfo, in the query string and
 * in path segments (Gemfury-style `https://host/<token>/npm/`), and the host
 * is all a stalled-request diagnosis needs. A scheme-less `//user:pw@host`
 * (pnpm prints registry keys in that form) loses its userinfo. Redaction is
 * by removal only; nothing is reconstructed from the credential-bearing
 * parts.
 */
export function redactDetail (detail: string): string {
  return detail
    .replace(/https?:\/\/\S+/gi, url => redactUrl(url))
    // Greedy up to the last '@' before the path, so an unencoded '@' inside
    // the password does not leave its tail behind.
    .replace(/\/\/[^/\s]+@/g, '//')
    .trim()
}

function sanitizeDetail (detail: string): string {
  const redacted = redactDetail(detail)
  if (redacted.length <= MAX_FAILURE_DETAIL_LENGTH) {
    return redacted
  }
  return `${redacted.slice(0, MAX_FAILURE_DETAIL_LENGTH)}…`
}

/**
 * Logs a child's stdout/stderr at debug level, redacted. Only the tail is
 * kept: for a timed-out child the most recent output is where a stalled
 * request shows, and a probe's answer is its last line. The user-facing
 * reason stays a one-liner, so this is the only place the output survives.
 */
function debugChildOutput (
  label: string,
  output: { stdout?: string, stderr?: string },
  { timedOut }: { timedOut: boolean },
): void {
  if (!debug.enabled) {
    return
  }
  for (const [stream, text] of [['stdout', output.stdout], ['stderr', output.stderr]] as const) {
    const redacted = redactDetail(text ?? '')
    if (redacted.length === 0) {
      continue
    }
    const tail = redacted.length <= MAX_DEBUG_OUTPUT_LENGTH
      ? redacted
      : `…${redacted.slice(-MAX_DEBUG_OUTPUT_LENGTH)}`
    // The output goes in as an argument, not the format string, so `%o`
    // and `%%` sequences in it are printed verbatim.
    debug(timedOut ? '%s timed out; partial %s:\n%s' : '%s %s:\n%s', label, stream, tail)
  }
}

/**
 * The first non-empty stream of a failed child, for the failure reason:
 * stderr carries the error for most package managers, stdout for some,
 * and execa's own message covers a child that never wrote at all.
 */
function firstChildOutput (result: ChildResult): string {
  return [result.stderr, result.stdout, result.shortMessage]
    .find(value => typeof value === 'string' && value.trim() !== '') ?? 'unknown error'
}

// Larger files are not plausible manifests; the cap also keeps a scan of a
// shared temp root from slurping an arbitrarily large unrelated file.
const MAX_ANCESTOR_MANIFEST_BYTES = 4 * 1024 * 1024

type WorkspaceAncestor = { dir: string, parseable: boolean }

async function directoryExists (dir: string): Promise<boolean> {
  try {
    await fs.access(dir)
    return true
  } catch {
    return false
  }
}

// Shared between the spawn-ENOENT and lockfile-read-ENOENT branches: both
// must rule out a reaped temp dir before attributing the ENOENT to anything
// more specific.
const TEMP_DIR_VANISHED: PruneBundledLockfileResult = {
  status: 'failed',
  reason: 'the temp directory disappeared while the command ran',
}

// A missing package manager binary is a real situation for bun, whose
// detection needs only a committed bun.lock. Pruning was never attempted,
// so it is a notable skip, not a failure whose message would suggest the
// lockfile is broken — and installing the package manager, not disabling
// pruning, is the fix.
function executableMissing (executable: string): PruneBundledLockfileResult {
  return {
    status: 'skipped',
    reason: `${executable} is not installed or not on PATH; install it so the lockfile can be pruned`,
    notable: true,
  }
}

/**
 * Classifies a failed spawn whose executable may simply be absent. On
 * Windows a missing executable never surfaces as a spawn ENOENT: execa
 * resolves the command itself (via which-command) and wraps an
 * unresolvable command in cmd.exe, so the child "runs" and exits non-zero
 * with cmd.exe's not-recognized message. Classify after the fact with a
 * PATH probe — safe against probe/spawn resolution differences, because
 * the command has already failed either way and only the reporting is at
 * stake. Executables given as a path are left to the spawn's own error
 * detail. Returns undefined when the executable exists, i.e. the failure
 * is the command's own.
 */
async function missingFromPath (executable: string): Promise<PruneBundledLockfileResult | undefined> {
  if (path.basename(executable) !== executable) {
    return undefined
  }
  const executablePath = await new PathLookup().lookupPath(executable)
  return executablePath === undefined ? executableMissing(executable) : undefined
}

/**
 * Walks from `startDir` to the filesystem root looking for a package.json
 * that declares npm workspaces. The caller treats any hit as "this location
 * is not a safe sandbox", so the scan errs toward matching: manifests are
 * parsed with the same leniency bun's own package.json parser has (JSONC —
 * comments and trailing commas, which strict JSON.parse rejects), and a
 * manifest that exists but cannot be parsed even then counts as a hit
 * (`parseable: false`), since bun's parser might still accept it.
 */
async function findWorkspaceAncestor (startDir: string): Promise<WorkspaceAncestor | undefined> {
  for (const dir of lineage(startDir)) {
    const manifestPath = path.join(dir, 'package.json')
    let raw: string
    try {
      // Shared temp roots can hold arbitrary files under this name; stat
      // first so a FIFO can't hang the read and an oversized file isn't
      // slurped.
      const stats = await fs.stat(manifestPath)
      if (!stats.isFile() || stats.size > MAX_ANCESTOR_MANIFEST_BYTES) {
        continue
      }
      raw = await fs.readFile(manifestPath, 'utf8')
    } catch {
      // No manifest here — keep walking.
      continue
    }
    try {
      const manifest = JSON5.parse(raw)
      if (manifest !== null && typeof manifest === 'object' && 'workspaces' in manifest) {
        return { dir, parseable: true }
      }
    } catch {
      return { dir, parseable: false }
    }
  }
  return undefined
}

/**
 * Regenerates the bundle's lockfile so it matches the bundle's actual set of
 * manifests, by materializing the resolution-relevant bundle entries into a
 * temp directory and running the package manager's lockfile-only install.
 *
 * Returns `skipped` when pruning is unnecessary or unsupported, and `failed`
 * when the caller should fall back to the original lockfile.
 */
export async function pruneBundledLockfile (
  options: PruneBundledLockfileOptions,
): Promise<PruneBundledLockfileResult> {
  const {
    workspace,
    packageManager,
    files,
    rewrittenManifests = new Set(),
    env = process.env,
  } = options
  // An explicit option (tests) outranks the environment; the destructuring
  // carries no default so that an omitted option is distinguishable.
  const timeoutMs = options.timeoutMs ?? timeoutFromEnv(env) ?? DEFAULT_TIMEOUT_MS

  const decision = shouldPruneLockfile(workspace, files, env, rewrittenManifests)
  if (!decision.prune) {
    return { status: 'skipped', reason: decision.reason, notable: decision.notable }
  }

  // Every pre-run skip below this point is notable: shouldPruneLockfile has
  // already established that the bundle is a partial workspace, so the
  // lockfile over-describes the bundle and this setup cannot be helped.
  // (The one post-run skip — a byte-identical regeneration — is the
  // opposite: pruning ran and proved there was nothing to change.)

  // This capability check must stay ahead of the lockfile read below: an
  // unsupported package manager should always skip notably, never surface
  // a lockfile read error as a 'failed' warning that implies pruning was
  // attempted.
  // Reassigned once the store directory is known (see below), so every
  // message past that point names the command that actually ran.
  let runnable = packageManager.lockfileOnlyInstallCommand()
  if (runnable === undefined) {
    return {
      status: 'skipped',
      reason: `${packageManager.name} has no supported lockfile-only install`,
      notable: true,
    }
  }

  const lockfileName = path.posix.basename(decision.lockfileArchivePath)

  let originalContent: string
  try {
    originalContent = await fs.readFile(workspace.lockfile.unwrap(), 'utf8')
  } catch (err) {
    return { status: 'failed', reason: `could not read the lockfile: ${(err as Error).message}` }
  }

  let original: LockfileSnapshot
  try {
    original = parseLockfileSnapshot(originalContent, lockfileName)
  } catch (err) {
    return { status: 'skipped', reason: (err as Error).message, notable: true }
  }

  if (original.excludeLinksFromLockfile) {
    // Without link entries in the lockfile, neither the backfill nor the
    // link-preservation check can see workspace links.
    return {
      status: 'skipped',
      reason: 'the lockfile is written with excludeLinksFromLockfile',
      notable: true,
    }
  }

  const selected = selectMaterializationEntries(files, decision.lockfileArchivePath)

  if (original.pnpmfileChecksum !== undefined) {
    const hasPnpmfile = selected.some(([archivePath]) => isPnpmfilePath(archivePath))
    if (!hasPnpmfile) {
      return {
        status: 'skipped',
        reason: 'the lockfile records a pnpmfile checksum but no pnpmfile is bundled',
        notable: true,
      }
    }
  }

  const backfill = await collectBackfilledManifests(workspace, selected, original)
  if ('skipReason' in backfill) {
    return { status: 'skipped', reason: backfill.skipReason, notable: true }
  }

  let tempDir: string | undefined
  try {
    // Assign before the realpath call so a realpath failure cannot leak the
    // freshly created directory.
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'checkly-lockfile-prune-'))
    tempDir = await fs.realpath(tempDir)

    // Bun re-roots at an ancestor directory whose package.json declares
    // workspaces with a glob matching the working directory — and then
    // resolves against THAT root and writes the regenerated lockfile there,
    // outside this sandbox, over a real file. This can only happen when the
    // system temp dir itself sits inside a workspace (e.g. TMPDIR pointing
    // into a repo), so refuse to run rather than risk it. pnpm pins the
    // write with --lockfile-dir and anchors at the materialized
    // pnpm-workspace.yaml, and npm does not re-root, so only bun needs the
    // guard.
    if (packageManager.name === 'bun') {
      const ancestor = await findWorkspaceAncestor(path.dirname(tempDir))
      if (ancestor !== undefined) {
        return {
          status: 'skipped',
          reason: (ancestor.parseable
            ? `the temp directory is inside the npm workspace at '${ancestor.dir}'`
            : `an unparseable package.json at '${ancestor.dir}' could not be ruled out as a workspace root`)
          + '; point TMPDIR (TEMP/TMP on Windows) outside any workspace to enable pruning',
          notable: true,
        }
      }
    }

    const entries: Array<[string, File]> = [
      ...selected,
      ...backfill.manifests,
    ]

    for (const [archiveRelativePath, file] of entries) {
      const target = path.join(tempDir, ...archiveRelativePath.split('/'))
      // Defense in depth alongside the '..' filter in
      // selectMaterializationEntries: never write outside the temp dir.
      // (A plain startsWith('..') would also reject a directory that merely
      // begins with two dots, e.g. '..artifacts'.)
      const relative = path.relative(tempDir, target)
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        continue
      }
      await fs.mkdir(path.dirname(target), { recursive: true })
      if (file.physical) {
        await fs.copyFile(file.filePath, target)
      } else {
        await fs.writeFile(target, file.content)
      }
    }

    // Guard against the selection or the write guards having dropped the
    // lockfile — running without one would be a from-scratch registry
    // resolution, not a prune.
    try {
      await fs.access(path.join(tempDir, lockfileName))
    } catch {
      return { status: 'failed', reason: 'the lockfile could not be materialized' }
    }

    // Yarn Classic must be stopped BEFORE the install is spawned: verified
    // on yarn 1.22.22 that it silently ignores --mode=update-lockfile and
    // performs a FULL install — fresh registry resolution, node_modules in
    // the temp dir, dependency lifecycle scripts — with exit 0, then writes
    // a v1 lockfile that fails verification with misleading advice. Classic
    // is what a plain `yarn` resolves to when a Berry project pins its
    // version via yarnPath (which lives in the unbundled .yarnrc.yml)
    // rather than the packageManager field. Only a positive 1.x match
    // skips: a failing or unparseable probe falls through to the install,
    // whose own error carries the real detail — so a probe hiccup can
    // never block a working prune, mirroring the post-hoc PATH probe
    // below. Probe and install share the executable, cwd and env, so their
    // version resolution cannot diverge.
    const childEnv = buildChildEnv(env)
    const budget = new PruneBudget(timeoutMs)
    const storeDirCommand = packageManager.storeDirCommand()
    // A whole budget below the install floor can never succeed when a probe
    // precedes the install (the yarn version check, the store lookup), so
    // reject it up front — before the probe, whose own outcome under such
    // a budget would be a misleading "timed out" rather than this
    // caller-misconfiguration.
    if ((packageManager.name === 'yarn' || storeDirCommand !== undefined) && budget.belowFloor) {
      return {
        status: 'failed',
        reason: `the prune timeout (${timeoutMs}ms) is below the minimum needed to run ${packageManager.name}`,
      }
    }
    if (packageManager.name === 'yarn') {
      const { result: probe, timeoutMs: probeTimeoutMs } = await budget.spawn(
        new Runnable(runnable.executable, ['--version']),
        { cwd: tempDir, env: childEnv },
      )
      if (probe.timedOut) {
        // The probe consumed the whole budget; spawning the install with
        // the ~zero remainder would only produce a confusing second kill.
        debugChildOutput(`${runnable.executable} --version`, probe, { timedOut: true })
        return { status: 'failed', reason: `${runnable.executable} timed out after ${formatBudget(probeTimeoutMs)}; ${TIMEOUT_HINT}` }
      }
      if (budget.belowFloor) {
        // The probe (typically a slow first-use corepack toolchain
        // download) left too little for the install; a 1 ms install would
        // be a misleading second timeout, so say what actually happened.
        return {
          status: 'failed',
          reason: 'provisioning the yarn toolchain used up the prune time budget before the'
            + ` lockfile could be regenerated; pre-install yarn or ${TIMEOUT_HINT}`,
        }
      }
      const probeVersion = probe.failed ? '' : probe.stdout?.trim() ?? ''
      const major = Number.parseInt(probeVersion, 10)
      if (major === 1) {
        return {
          status: 'skipped',
          reason: 'yarn resolves to Yarn Classic (1.x) here, which cannot regenerate'
            + ' a Yarn Berry lockfile; set the packageManager field in package.json'
            + ' and enable Corepack so a Yarn 2+ binary runs instead',
          notable: true,
        }
      }
      // Yarn only REUSES a lockfile written by its own generation — handed
      // an older one it re-resolves everything, which the network guard
      // blocks (verified: yarn 4.18 re-resolves both v6 and v8 lockfiles).
      // A cross-generation mismatch would therefore fail with a message
      // about blocked registry requests; skip with the actual remedies
      // instead. The parser only accepts versions in the table, so the
      // lookup is always defined here.
      const requiredMajor = YARN_METADATA_VERSION_TO_MAJOR[original.lockfileVersion ?? '']
      if (major >= 2 && major !== requiredMajor) {
        return {
          status: 'skipped',
          reason: `the lockfile was written by yarn ${requiredMajor} (metadata version`
            + ` ${original.lockfileVersion}) but yarn resolves to ${sanitizeDetail(probeVersion)} here;`
            + ' run your own install to migrate the lockfile, or pin the matching yarn'
            + ' version via the packageManager field in package.json so Corepack provisions it',
          notable: true,
        }
      }
      if (major >= 4) {
        // Hardened mode revalidates locked entries against the registry —
        // yarn 4 enables it automatically on pull-request CI, and with the
        // network guard above that would fail every prune there. Only set
        // for a CONFIRMED yarn 4+: the setting does not exist before yarn
        // 4, which rejects unknown environment settings with a usage error
        // (verified on 3.8.7). An unidentified yarn proceeds without it —
        // worst case a hardened-mode prune fails closed with a warning.
        childEnv.YARN_ENABLE_HARDENED_MODE = '0'
      }
    }

    // Pins the store the install resolves from to the workspace's own,
    // which pnpm would not pick for a temp dir on another filesystem (the
    // rationale is with PNpmDetector.lockfileOnlyInstallCommand). The
    // lookup runs in the WORKSPACE ROOT so it reads the workspace's own
    // config and applies pnpm's same-mount rule to the real project dir.
    // An unusable answer is a notable skip, not a failure: running against
    // an empty store is the very thing being avoided, and the remedy is
    // the package manager's installation or configuration, not the
    // lockfile.
    if (storeDirCommand !== undefined) {
      const display = storeDirCommand.unsafeDisplayCommand
      const { result: probe, timeoutMs: probeTimeoutMs } = await budget.spawn(
        storeDirCommand,
        { cwd: workspace.root.path, env: childEnv },
      )
      if (probe.timedOut) {
        debugChildOutput(display, probe, { timedOut: true })
        return { status: 'failed', reason: `${display} timed out after ${formatBudget(probeTimeoutMs)}; ${TIMEOUT_HINT}` }
      }
      debugChildOutput(display, probe, { timedOut: false })
      if (probe.code === 'ENOENT') {
        // execa also reports ENOENT for an invalid working directory, so
        // rule out a vanished workspace root before blaming the executable.
        if (!await directoryExists(workspace.root.path)) {
          return { status: 'failed', reason: `the workspace directory '${workspace.root.path}' disappeared` }
        }
        return executableMissing(storeDirCommand.executable)
      }
      if (budget.belowFloor) {
        return {
          status: 'failed',
          reason: `determining the ${packageManager.name} store directory used up the prune time budget before the`
            + ` lockfile could be regenerated; pre-install ${packageManager.name} or ${TIMEOUT_HINT}`,
        }
      }
      if (probe.failed || probe.exitCode !== 0) {
        const missing = await missingFromPath(storeDirCommand.executable)
        if (missing !== undefined) {
          return missing
        }
        return {
          status: 'skipped',
          reason: `the ${packageManager.name} store directory could not be determined`
            + ` (${display} failed: ${sanitizeDetail(firstChildOutput(probe))})`,
          notable: true,
        }
      }
      // The path is the last non-empty line: pnpm 10's default reporter
      // can print warnings to stdout ahead of it. It must be absolute and
      // versioned (`<storeDir>/v10`) — anything else means the command's
      // output changed shape, and guessing would risk an empty store. The
      // PARENT is what gets pinned: pnpm appends its own version segment,
      // and the install's pnpm may be of another major than the lookup's.
      const printed = (probe.stdout ?? '').split(/\r?\n/).map(line => line.trim()).filter(line => line !== '').at(-1)
      if (printed === undefined || !path.isAbsolute(printed) || !/^v\d+$/.test(path.basename(printed))) {
        return {
          status: 'skipped',
          reason: `the ${packageManager.name} store directory could not be determined (${display} printed`
            + ` ${printed === undefined ? 'nothing' : `'${sanitizeDetail(printed)}'`} instead of a versioned store path)`,
          notable: true,
        }
      }
      runnable = packageManager.lockfileOnlyInstallCommand({ storeDir: path.dirname(printed) }) ?? runnable
    }

    debug(`Running ${runnable.unsafeDisplayCommand} in ${tempDir}`)

    const { result, timeoutMs: installTimeoutMs } = await budget.spawn(runnable, { cwd: tempDir, env: childEnv })

    if (result.timedOut) {
      debugChildOutput(runnable.executable, result, { timedOut: true })
      return { status: 'failed', reason: `${runnable.executable} timed out after ${formatBudget(installTimeoutMs)}; ${TIMEOUT_HINT}` }
    }
    if ((result as any).code === 'ENOENT') {
      // A spawn ENOENT can also mean the working directory vanished (a temp
      // reaper); only report a missing executable when the temp dir is
      // still there.
      if (!await directoryExists(tempDir)) {
        return TEMP_DIR_VANISHED
      }
      return executableMissing(runnable.executable)
    }
    if (result.failed || result.exitCode !== 0) {
      const missing = await missingFromPath(runnable.executable)
      if (missing !== undefined) {
        return missing
      }
      const detail = firstChildOutput(result)
      // Yarn's blocked-request error is the network guard doing its job;
      // surfaced verbatim it reads like the user's own configuration is
      // broken. Name the two real causes instead — a stale lockfile, or a
      // same-generation yarn that still declines to reuse it (e.g. a v8
      // lockfile under a yarn that writes v10). Scan BOTH streams: real
      // yarn prints YN0080 on stdout, but the single-stream `detail` above
      // prefers a non-empty stderr, so the marker can hide in either one.
      const yarnOutput = [result.stdout, result.stderr]
        .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        .join('\n')
      if (packageManager.name === 'yarn' && /has been blocked/.test(yarnOutput)) {
        return {
          status: 'failed',
          reason: 'yarn needed the network to reuse the lockfile, which pruning forbids'
            + ' — the lockfile may be out of date with a package.json, or written by a'
            + ' different yarn version than the one that ran (pin it via the'
            + ' packageManager field); the request was blocked before any package name'
            // Yarn's own output stays attached so the affected descriptor
            // is identifiable; echoing it is no new disclosure, the
            // request never left the machine.
            + ` left the machine: ${sanitizeDetail(yarnOutput)}`,
        }
      }
      return {
        status: 'failed',
        reason: `${runnable.unsafeDisplayCommand} failed: ${sanitizeDetail(detail)}`,
      }
    }

    let regeneratedContent: string
    try {
      regeneratedContent = await fs.readFile(path.join(tempDir, lockfileName), 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // As in the spawn ENOENT branch: distinguish a reaped temp dir from
        // a deliberately removed lockfile.
        if (!await directoryExists(tempDir)) {
          return TEMP_DIR_VANISHED
        }
        // Some package managers remove rather than write a lockfile in edge
        // cases (bun deletes one that would describe no packages at all:
        // "No packages! Deleted empty lockfile") — deliberate behavior, not
        // a broken lockfile, so don't surface it as a failure whose advice
        // says to refresh the lockfile.
        return {
          status: 'skipped',
          reason: 'the regenerated lockfile was not found after the command completed'
            + ' (some package managers delete a lockfile that would describe no packages)',
          notable: true,
        }
      }
      return {
        status: 'failed',
        reason: `could not read the regenerated lockfile: ${(err as Error).message}`,
      }
    }

    // A byte-identical regeneration with backfilled manifests still counts
    // as a prune: the manifests must reach the bundle (a lockfile importer
    // without a manifest breaks the remote install), and the verification
    // below passes trivially for identical content.
    if (regeneratedContent === originalContent && backfill.manifests.size === 0) {
      return {
        status: 'skipped',
        reason: 'the regenerated lockfile is identical to the original',
        consistent: true,
      }
    }

    let regenerated: LockfileSnapshot
    try {
      regenerated = parseLockfileSnapshot(regeneratedContent, lockfileName)
    } catch (err) {
      return { status: 'failed', reason: (err as Error).message }
    }

    const problem = verifyPrunedLockfile(original, regenerated, files)
    if (problem !== undefined) {
      return { status: 'failed', reason: problem }
    }

    return {
      status: 'pruned',
      archivePath: decision.lockfileArchivePath,
      content: regeneratedContent,
      originalContent,
      backfilledManifests: Array.from(backfill.manifests.values()),
    }
  } catch (err) {
    return { status: 'failed', reason: (err as Error).message }
  } finally {
    if (tempDir !== undefined) {
      // Cleanup failures must never override the computed result.
      await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3 })
        .catch(err => debug(`Could not remove temp dir ${tempDir}: ${err}`))
    }
  }
}
