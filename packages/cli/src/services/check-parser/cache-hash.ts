import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { Workspace } from './package-files/workspace.js'

export interface PackageJsonInput {
  /**
   * Path used to identify this package.json in the hash. Should be a
   * forward-slash relative path matching the file's location in the
   * eventual archive (e.g. "package.json" or "packages/cli/package.json").
   */
  path: string
  raw: Buffer
}

export interface LockfileInput {
  /**
   * Basename of the lockfile (e.g. "package-lock.json").
   */
  name: string
  /**
   * Raw 32-byte SHA-256 digest of the lockfile contents.
   */
  hash: Buffer
}

export interface NpmrcInput {
  /**
   * Forward-slash relative path matching the .npmrc's location in the eventual
   * archive (e.g. ".npmrc" or "packages/app/.npmrc").
   */
  path: string
  /**
   * Raw 32-byte SHA-256 digest of the .npmrc contents.
   */
  hash: Buffer
}

export interface PnpmfileInput {
  /**
   * Forward-slash relative path matching the pnpmfile's location in the
   * eventual archive (e.g. ".pnpmfile.cjs" or ".pnpmfile.mjs").
   */
  path: string
  /**
   * Raw 32-byte SHA-256 digest of the pnpmfile contents.
   */
  hash: Buffer
}

export interface EmbeddedPackageInput {
  /** Package name as recorded in the lockfile, e.g. `@acme/foo`. */
  name: string
  /** Exact version, e.g. `1.2.3`. */
  version: string
  /** The lockfile's recorded integrity for the artifact (SRI string). */
  integrity: string
}

export interface FauxPackageJsonInput {
  /**
   * Forward-slash relative path matching the faux manifest's location in the
   * eventual archive (e.g. "packages/member/package.json").
   */
  path: string
  /**
   * The faux manifest's raw content bytes.
   */
  raw: Buffer
}

export interface ComposeCacheHashInput {
  lockfile?: LockfileInput
  packageJsons: PackageJsonInput[]
  npmrcs?: NpmrcInput[]
  /**
   * The workspace root's bundleable pnpmfiles (pnpm workspaces only). pnpm's
   * install hooks change resolution results without necessarily touching the
   * lockfile (the recorded `pnpmfileChecksum` only updates when the user
   * reinstalls), so the bundled files must contribute to the hash. An empty
   * or absent list writes no records, leaving the digest identical to one
   * computed before this input existed.
   */
  pnpmfiles?: PnpmfileInput[]
  /**
   * The resolved set of embedded package tarballs shipped in the bundle
   * (`bundle.packages.embed` after lockfile resolution, filtered to what
   * the shipped — possibly pruned — bundled lockfile still references).
   * Embedded tarballs change the runner's install-step inputs without
   * necessarily touching the lockfile, so they must contribute to the hash.
   * An empty or absent list writes no records, leaving the digest identical
   * to one computed before this input existed.
   */
  embeddedPackages?: EmbeddedPackageInput[]
  excludedFields: string[]
  /**
   * Optional user-provided cache version, already normalized to a string.
   * An empty string is treated the same as undefined: no record is written,
   * so the digest stays identical to one computed without this input.
   */
  dependencyCacheVersion?: string
  /**
   * Every synthesized (non-physical) `package.json` actually shipped in the
   * bundle — in practice the faux workspace member manifests. Unlike
   * on-disk manifests — whose `version` is excluded because the pinned
   * lockfile absorbs it — a synthesized manifest's full content including
   * its version is load-bearing for the remote install (it decides whether
   * a specifier resolves to the workspace link, the registry, or fails), so
   * these are hashed verbatim, exactly as the bytes ship. An empty or
   * absent list writes no records, leaving the digest unchanged.
   */
  fauxPackageJsons?: FauxPackageJsonInput[]
  /**
   * The pruned lockfile actually shipped in the bundle, when lockfile
   * pruning replaced the original. The pruned bytes are the runner's real
   * install input, so they must contribute to the hash. Absent when the
   * original lockfile ships unchanged, writing no record.
   */
  prunedLockfile?: LockfileInput
}

const PACKAGE_JSON_EXCLUDED_FIELDS = ['version']

/**
 * Encodes a value as JSON in a way that's stable across runs and machines.
 *
 * Differences from {@link JSON.stringify}:
 * - Object keys are sorted (byte-wise / code-point order) before
 *   serialization. This is the load-bearing difference — without it, two
 *   equivalent package.json files written in different key orders would
 *   produce different hashes.
 * - HTML-significant characters (`<`, `>`, `&`) are escaped as
 *   `\u003c`/`\u003e`/`\u0026`.
 * - U+2028 and U+2029 are escaped as `\u2028`/`\u2029`.
 * - No whitespace between tokens.
 * - Numbers use {@link String}; floating-point edge cases may differ from
 *   other encoders. Package.json content is effectively never numeric
 *   outside config blobs, so this is negligible in practice.
 */
export function stableJsonEncode (value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot encode non-finite number: ${value}`)
    }
    return String(value)
  }
  if (typeof value === 'string') {
    return encodeString(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableJsonEncode).join(',') + ']'
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return '{' + keys.map(key => {
      return encodeString(key) + ':' + stableJsonEncode(obj[key])
    }).join(',') + '}'
  }
  throw new Error(`Unsupported value type: ${typeof value}`)
}

const STRING_ESCAPES: Record<number, string> = {
  0x22: '\\"',
  0x5c: '\\\\',
  0x08: '\\b',
  0x09: '\\t',
  0x0a: '\\n',
  0x0c: '\\f',
  0x0d: '\\r',
  0x3c: '\\u003c', // <
  0x3e: '\\u003e', // >
  0x26: '\\u0026', // &
  0x2028: '\\u2028',
  0x2029: '\\u2029',
}

function encodeString (s: string): string {
  let out = '"'
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    const escape = STRING_ESCAPES[code]
    if (escape !== undefined) {
      out += escape
    } else if (code < 0x20) {
      out += '\\u' + code.toString(16).padStart(4, '0')
    } else {
      out += s[i]
    }
  }
  out += '"'
  return out
}

/**
 * Parses a package.json, removes the named top-level fields, and re-encodes
 * the result via {@link stableJsonEncode}.
 */
export function canonicalizePackageJson (raw: Buffer, excludedFields: string[]): Buffer {
  const obj = JSON.parse(raw.toString('utf8'))
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('package.json must contain a JSON object at the top level')
  }
  for (const field of excludedFields) {
    delete obj[field]
  }
  return Buffer.from(stableJsonEncode(obj), 'utf8')
}

/**
 * Combines a lockfile digest and a set of canonicalized package.json
 * entries into a single SHA-256 hex digest.
 *
 * Each record contributes:
 *   uint64-be(label length) || label bytes ||
 *   uint64-be(content length) || content bytes
 *
 * Records are written in the following order:
 *   1. The lockfile record (if present), labeled `lockfile:<basename>`,
 *      whose content is the raw 32-byte SHA-256 digest of the lockfile.
 *   2. One record per package.json sorted by path, labeled
 *      `package.json:<relative/path>`, whose content is the canonicalized
 *      package.json bytes.
 *   3. One record per .npmrc sorted by path, labeled
 *      `npmrc:<relative/path>`, whose content is the raw 32-byte SHA-256
 *      digest of the .npmrc contents.
 *   4. One record per bundleable pnpmfile sorted by path, labeled
 *      `pnpmfile:<relative/path>`, whose content is the raw 32-byte SHA-256
 *      digest of the pnpmfile contents.
 *   5. One record per embedded package sorted by `name@version`, labeled
 *      `embedded-package:<name@version>`, whose content is the raw UTF-8
 *      bytes of the lockfile's integrity string for the artifact. Callers
 *      must pass at most one entry per `name@version` (the materializer
 *      already de-duplicates); the record order among duplicate keys is
 *      undefined.
 *   6. The dependency cache version record (if set to a non-empty string),
 *      labeled `dependency-cache-version`, whose content is the raw UTF-8
 *      bytes of the user-provided value. An empty string is treated as
 *      absent so that e.g. an unset environment variable interpolated into
 *      the config leaves the digest unchanged.
 *   7. One record per faux workspace member manifest sorted by path,
 *      labeled `faux-package.json:<relative/path>`, whose content is the
 *      manifest's raw UTF-8 bytes.
 *   8. The pruned lockfile record (if present), labeled
 *      `pruned-lockfile:<basename>`, whose content is the raw 32-byte
 *      SHA-256 digest of the pruned lockfile contents.
 *
 * All sorts compare strings by UTF-16 code unit (JavaScript's `<`/`>`),
 * which coincides with byte-wise UTF-8 order for ASCII inputs — the only
 * kind that occurs in practice. Mirror implementations in other languages
 * must reproduce this order exactly.
 */
export function composeCacheHash (input: ComposeCacheHashInput): string {
  const hash = createHash('sha256')

  const writeRecord = (label: string, content: Buffer): void => {
    const labelBytes = Buffer.from(label, 'utf8')
    hash.update(uint64BE(labelBytes.length))
    hash.update(labelBytes)
    hash.update(uint64BE(content.length))
    hash.update(content)
  }

  if (input.lockfile) {
    writeRecord(`lockfile:${input.lockfile.name}`, input.lockfile.hash)
  }

  const sorted = [...input.packageJsons].sort((a, b) => compareStrings(a.path, b.path))

  for (const entry of sorted) {
    const canonical = canonicalizePackageJson(entry.raw, input.excludedFields)
    writeRecord(`package.json:${entry.path}`, canonical)
  }

  const sortedNpmrcs = [...(input.npmrcs ?? [])].sort((a, b) => compareStrings(a.path, b.path))

  for (const entry of sortedNpmrcs) {
    writeRecord(`npmrc:${entry.path}`, entry.hash)
  }

  const sortedPnpmfiles = [...(input.pnpmfiles ?? [])].sort((a, b) => compareStrings(a.path, b.path))

  for (const entry of sortedPnpmfiles) {
    writeRecord(`pnpmfile:${entry.path}`, entry.hash)
  }

  const sortedEmbedded = (input.embeddedPackages ?? [])
    .map(entry => ({ key: `${entry.name}@${entry.version}`, integrity: entry.integrity }))
    .sort((a, b) => compareStrings(a.key, b.key))

  for (const entry of sortedEmbedded) {
    writeRecord(`embedded-package:${entry.key}`, Buffer.from(entry.integrity, 'utf8'))
  }

  if (input.dependencyCacheVersion) {
    writeRecord('dependency-cache-version', Buffer.from(input.dependencyCacheVersion, 'utf8'))
  }

  const sortedFaux = [...(input.fauxPackageJsons ?? [])].sort((a, b) => compareStrings(a.path, b.path))

  for (const entry of sortedFaux) {
    writeRecord(`faux-package.json:${entry.path}`, entry.raw)
  }

  if (input.prunedLockfile) {
    writeRecord(`pruned-lockfile:${input.prunedLockfile.name}`, input.prunedLockfile.hash)
  }

  return hash.digest('hex')
}

function compareStrings (a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function uint64BE (n: number): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(n))
  return buf
}

/**
 * Reads the workspace lockfile, every workspace package.json, and every
 * workspace `.npmrc` (root + member packages) and returns the inputs needed
 * by {@link composeCacheHash}.
 *
 * Paths are normalized to forward slashes and made relative to the
 * workspace root so that they match what ends up in the bundle archive.
 *
 * `.npmrc` is hashed so that repointing a registry (which need not touch the
 * lockfile) invalidates the bundle cache. Packages without an `.npmrc`
 * contribute nothing, so a workspace with no `.npmrc` produces a hash
 * identical to before this input existed.
 *
 * The workspace's bundleable pnpmfiles (see {@link Workspace.pnpmfiles}) are
 * hashed for the same reason: their install hooks change resolution results,
 * and the lockfile's recorded `pnpmfileChecksum` only updates when the user
 * reinstalls, so the lockfile bytes alone do not cover them. A workspace
 * without bundleable pnpmfiles contributes nothing.
 */
export async function loadWorkspaceCacheHashInputs (
  workspace: Workspace,
): Promise<WorkspaceCacheHashInputs> {
  const allPackages = [workspace.root, ...workspace.packages]

  const packageJsons = await Promise.all(allPackages.map(async pkg => {
    const raw = await fs.readFile(pkg.packageJsonPath)
    const rel = path.relative(workspace.root.path, pkg.packageJsonPath)
    return {
      path: rel.split(path.sep).join('/'),
      raw,
    }
  }))

  const npmrcResults = await Promise.all(allPackages.map(async (pkg): Promise<NpmrcInput | undefined> => {
    const npmrcPath = path.join(pkg.path, '.npmrc')
    let bytes: Buffer
    try {
      bytes = await fs.readFile(npmrcPath)
    } catch (err) {
      // A missing .npmrc simply contributes nothing. Any other error (e.g.
      // EACCES on a present file) must surface rather than silently dropping a
      // file that would still be bundled — that would desync the cache key from
      // the bundle contents.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined
      }
      throw err
    }
    const rel = path.relative(workspace.root.path, npmrcPath)
    return {
      path: rel.split(path.sep).join('/'),
      hash: createHash('sha256').update(bytes).digest(),
    }
  }))
  const npmrcs = npmrcResults.filter((entry): entry is NpmrcInput => entry !== undefined)

  let lockfile: LockfileInput | undefined
  if (workspace.lockfile.isOk()) {
    const lockfilePath = workspace.lockfile.ok()
    const lockfileBytes = await fs.readFile(lockfilePath)
    lockfile = {
      name: path.basename(lockfilePath),
      hash: createHash('sha256').update(lockfileBytes).digest(),
    }
  }

  // Hash exactly the pnpmfiles that get bundled (Workspace.pnpmfiles is the
  // shared source of truth), so the cache key always reflects the bundle
  // contents. A read error here must surface: silently dropping a file that
  // would still be bundled would desync the cache key from the bundle.
  const pnpmfiles = await Promise.all(workspace.pnpmfiles
    .filter(info => info.skipReason === undefined)
    .map(async (info): Promise<PnpmfileInput> => {
      const bytes = await fs.readFile(info.path)
      return {
        path: path.relative(workspace.root.path, info.path).split(path.sep).join('/'),
        hash: createHash('sha256').update(bytes).digest(),
      }
    }))

  return { lockfile, packageJsons, npmrcs, pnpmfiles }
}

export interface ComputeWorkspaceCacheHashOptions {
  /**
   * Optional user-provided cache version (`caching.dependencyCache.version`
   * in the checkly config) mixed into the hash as an extra record. Numbers
   * are converted with {@link String} and must be safe integers — larger or
   * fractional values do not stringify exactly (or use exponent notation),
   * which would break parity with non-JavaScript implementations of this
   * hash. Undefined and the empty string leave the digest unchanged.
   */
  dependencyCacheVersion?: string | number
  /**
   * The resolved set of embedded package tarballs shipped in the bundle.
   * See {@link ComposeCacheHashInput.embeddedPackages}.
   */
  embeddedPackages?: EmbeddedPackageInput[]
}

/**
 * Normalizes a user-provided dependency cache version to the exact string
 * that gets hashed, or undefined when the value is unset (or an empty
 * string, which is treated as unset).
 */
export function normalizeDependencyCacheVersion (version: string | number | undefined): string | undefined {
  if (version === undefined || version === '') {
    return undefined
  }
  if (typeof version === 'number') {
    if (!Number.isSafeInteger(version)) {
      throw new Error(`Dependency cache version must be a safe integer if given as a number, got ${version}`)
    }
    return String(version)
  }
  if (typeof version !== 'string') {
    throw new Error(`Dependency cache version must be a string or a safe integer, got ${typeof version}`)
  }
  return version
}

export interface WorkspaceCacheHashInputs {
  lockfile?: LockfileInput
  packageJsons: PackageJsonInput[]
  npmrcs: NpmrcInput[]
  pnpmfiles: PnpmfileInput[]
}

export interface ComposeWorkspaceCacheHashOptions extends ComputeWorkspaceCacheHashOptions {
  /**
   * See {@link ComposeCacheHashInput.fauxPackageJsons}.
   */
  fauxPackageJsons?: FauxPackageJsonInput[]
  /**
   * See {@link ComposeCacheHashInput.prunedLockfile}.
   */
  prunedLockfile?: LockfileInput
}

/**
 * Composes the workspace cache hash from pre-loaded inputs, with the
 * standard set of excluded package.json fields. Lets callers that need to
 * recompute the hash later (with bundle-time inputs like faux manifests or
 * a pruned lockfile) reuse inputs loaded once.
 */
export function composeWorkspaceCacheHash (
  inputs: WorkspaceCacheHashInputs,
  options?: ComposeWorkspaceCacheHashOptions,
): string {
  return composeCacheHash({
    ...inputs,
    embeddedPackages: options?.embeddedPackages,
    fauxPackageJsons: options?.fauxPackageJsons,
    prunedLockfile: options?.prunedLockfile,
    excludedFields: PACKAGE_JSON_EXCLUDED_FIELDS,
    dependencyCacheVersion: normalizeDependencyCacheVersion(options?.dependencyCacheVersion),
  })
}

/**
 * Convenience wrapper that loads workspace inputs and composes the cache
 * hash with the standard set of excluded package.json fields.
 */
export async function computeWorkspaceCacheHash (
  workspace: Workspace,
  options?: ComputeWorkspaceCacheHashOptions,
): Promise<string> {
  const inputs = await loadWorkspaceCacheHashInputs(workspace)
  return composeWorkspaceCacheHash(inputs, options)
}
