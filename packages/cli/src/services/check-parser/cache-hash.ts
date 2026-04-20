import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { Workspace } from './package-files/workspace'

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

export interface ComposeCacheHashInput {
  lockfile?: LockfileInput
  packageJsons: PackageJsonInput[]
  excludedFields: string[]
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
 *   2. One record per package.json sorted byte-wise by path, labeled
 *      `package.json:<relative/path>`, whose content is the canonicalized
 *      package.json bytes.
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

  const sorted = [...input.packageJsons].sort((a, b) => {
    if (a.path < b.path) return -1
    if (a.path > b.path) return 1
    return 0
  })

  for (const entry of sorted) {
    const canonical = canonicalizePackageJson(entry.raw, input.excludedFields)
    writeRecord(`package.json:${entry.path}`, canonical)
  }

  return hash.digest('hex')
}

function uint64BE (n: number): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(n))
  return buf
}

/**
 * Reads the workspace lockfile and every workspace package.json (root +
 * member packages) and returns the inputs needed by {@link composeCacheHash}.
 *
 * Paths are normalized to forward slashes and made relative to the
 * workspace root so that they match what ends up in the bundle archive.
 */
export async function loadWorkspaceCacheHashInputs (
  workspace: Workspace,
): Promise<{ lockfile?: LockfileInput, packageJsons: PackageJsonInput[] }> {
  const allPackages = [workspace.root, ...workspace.packages]

  const packageJsons = await Promise.all(allPackages.map(async pkg => {
    const raw = await fs.readFile(pkg.packageJsonPath)
    const rel = path.relative(workspace.root.path, pkg.packageJsonPath)
    return {
      path: rel.split(path.sep).join('/'),
      raw,
    }
  }))

  let lockfile: LockfileInput | undefined
  if (workspace.lockfile.isOk()) {
    const lockfilePath = workspace.lockfile.ok()
    const lockfileBytes = await fs.readFile(lockfilePath)
    lockfile = {
      name: path.basename(lockfilePath),
      hash: createHash('sha256').update(lockfileBytes).digest(),
    }
  }

  return { lockfile, packageJsons }
}

/**
 * Convenience wrapper that loads workspace inputs and composes the cache
 * hash with the standard set of excluded package.json fields.
 */
export async function computeWorkspaceCacheHash (workspace: Workspace): Promise<string> {
  const inputs = await loadWorkspaceCacheHashInputs(workspace)
  return composeCacheHash({
    ...inputs,
    excludedFields: PACKAGE_JSON_EXCLUDED_FIELDS,
  })
}
