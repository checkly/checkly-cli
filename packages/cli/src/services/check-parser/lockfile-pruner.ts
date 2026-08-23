import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import Debug from 'debug'
import { execa } from 'execa'
import { parse as parseYaml } from 'yaml'

import { createFauxPackageFiles } from './faux-package.js'
import { isPnpmfilePath } from './package-files/pnpmfile.js'
import { PackageManager } from './package-files/package-manager.js'
import { Package, Workspace } from './package-files/workspace.js'
import { File, VirtualFile } from './parser.js'
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
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  /**
   * Called right before the package manager runs — after every skip
   * condition has been ruled out — so callers can report progress for a
   * step that may take a few seconds.
   */
  onRun?: () => void
}

export type PruneBundledLockfileResult =
  | {
    status: 'pruned'
    /** The lockfile's archive path. */
    archivePath: string
    /** The regenerated lockfile contents. */
    content: string
    /**
     * Faux manifests synthesized for workspace members that bundled
     * manifests reference as links but that have no manifest in the bundle
     * (see {@link pruneBundledLockfile}). The caller must register these
     * into the bundle so that the bundle and the pruned lockfile stay
     * consistent.
     */
    backfilledManifests: VirtualFile[]
  }
  | { status: 'skipped', reason: string }
  | { status: 'failed', reason: string }

// A legitimate prune reuses resolutions from the lockfile and takes seconds
// (measured 1-4s even against multi-thousand-package lockfiles); only a
// stale lockfile behind an unreachable registry runs long, and that path
// ends in a fallback anyway because the subset check rejects fresh
// resolutions — so waiting minutes buys nothing.
const DEFAULT_TIMEOUT_MS = 30_000

const MAX_FAILURE_DETAIL_LENGTH = 400

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
])

function manifestArchivePath (workspace: Workspace, pkg: Package): string {
  return pathToPosix(path.relative(workspace.root.path, pkg.packageJsonPath))
}

function unknownVersionReason (pkg: Package): string {
  return `the version of workspace package '${pkg.name}' could not be determined`
}

function lockfileArchivePath (workspace: Workspace): string | undefined {
  if (!workspace.lockfile.isOk()) {
    return undefined
  }
  return pathToPosix(path.relative(workspace.root.path, workspace.lockfile.unwrap()))
}

export type ShouldPruneResult =
  | { prune: true, lockfileArchivePath: string }
  | { prune: false, reason: string }

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
): ShouldPruneResult {
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
    const manifest = files.get(manifestArchivePath(workspace, pkg))
    if (manifest === undefined || !manifest.physical) {
      bundleMatchesWorkspace = false
    }
    // A faux manifest for a member with an unknown version carries the
    // 0.0.0 fallback, which could make specifiers resolve differently than
    // they did for the user; do not feed it into resolution.
    if (manifest !== undefined && !manifest.physical && pkg.version === undefined) {
      return { prune: false, reason: unknownVersionReason(pkg) }
    }
  }

  if (bundleMatchesWorkspace) {
    return { prune: false, reason: 'the bundle contains the full workspace' }
  }

  return { prune: true, lockfileArchivePath: archivePath }
}

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

const PNPM_DEPENDENCY_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies']

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

    for (const group of PNPM_DEPENDENCY_GROUPS) {
      const entries = manifest?.[group]
      if (entries === null || typeof entries !== 'object') {
        continue
      }
      for (const [name, spec] of Object.entries<any>(entries)) {
        const member = workspace.memberByName(name)
        if (member === undefined || member === workspace.root) {
          continue
        }
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
  return env
}

function sanitizeDetail (detail: string): string {
  // Package manager output can embed registry URLs with userinfo credentials
  // (pnpm does not redact them); scrub before surfacing anywhere.
  const redacted = detail.replace(/\/\/[^/@\s]+@/g, '//').trim()
  if (redacted.length <= MAX_FAILURE_DETAIL_LENGTH) {
    return redacted
  }
  return `${redacted.slice(0, MAX_FAILURE_DETAIL_LENGTH)}…`
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
    timeoutMs = DEFAULT_TIMEOUT_MS,
    env = process.env,
    onRun,
  } = options

  const decision = shouldPruneLockfile(workspace, files, env)
  if (!decision.prune) {
    return { status: 'skipped', reason: decision.reason }
  }

  const runnable = packageManager.lockfileOnlyInstallCommand()
  if (runnable === undefined) {
    return {
      status: 'skipped',
      reason: `${packageManager.name} has no supported lockfile-only install`,
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
    return { status: 'skipped', reason: (err as Error).message }
  }

  if (original.excludeLinksFromLockfile) {
    // Without link entries in the lockfile, neither the backfill nor the
    // link-preservation check can see workspace links.
    return { status: 'skipped', reason: 'the lockfile is written with excludeLinksFromLockfile' }
  }

  const selected = selectMaterializationEntries(files, decision.lockfileArchivePath)

  if (original.pnpmfileChecksum !== undefined) {
    const hasPnpmfile = selected.some(([archivePath]) => isPnpmfilePath(archivePath))
    if (!hasPnpmfile) {
      return {
        status: 'skipped',
        reason: 'the lockfile records a pnpmfile checksum but no pnpmfile is bundled',
      }
    }
  }

  const backfill = await collectBackfilledManifests(workspace, selected, original)
  if ('skipReason' in backfill) {
    return { status: 'skipped', reason: backfill.skipReason }
  }

  let tempDir: string | undefined
  try {
    // Assign before the realpath call so a realpath failure cannot leak the
    // freshly created directory.
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'checkly-lockfile-prune-'))
    tempDir = await fs.realpath(tempDir)

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

    debug(`Running ${runnable.unsafeDisplayCommand} in ${tempDir}`)
    onRun?.()

    const result = await execa(runnable.executable, runnable.args, {
      cwd: tempDir,
      env: buildChildEnv(env),
      extendEnv: false,
      timeout: timeoutMs,
      reject: false,
    })

    if (result.timedOut) {
      return { status: 'failed', reason: `${runnable.executable} timed out after ${timeoutMs}ms` }
    }
    if (result.failed || result.exitCode !== 0) {
      const detail = [result.stderr, result.stdout, (result as any).shortMessage]
        .find(value => typeof value === 'string' && value.trim() !== '') ?? 'unknown error'
      return {
        status: 'failed',
        reason: `${runnable.unsafeDisplayCommand} failed: ${sanitizeDetail(String(detail))}`,
      }
    }

    let regeneratedContent: string
    try {
      regeneratedContent = await fs.readFile(path.join(tempDir, lockfileName), 'utf8')
    } catch (err) {
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
      return { status: 'skipped', reason: 'the regenerated lockfile is identical to the original' }
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
