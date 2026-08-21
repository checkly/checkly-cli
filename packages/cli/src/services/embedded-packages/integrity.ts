import { createHash } from 'node:crypto'

/**
 * A single parsed SRI (Subresource Integrity) hash, e.g. one
 * `sha512-<base64>` segment of a lockfile `integrity` value.
 */
export interface IntegrityHash {
  algorithm: string
  digestBase64: string
}

// Ordered strongest first. Lockfiles produced in the last decade only use
// sha512 and (for very old entries) sha1, but sha384/sha256 are valid SRI.
const SUPPORTED_ALGORITHMS = ['sha512', 'sha384', 'sha256', 'sha1']

/**
 * Parses an SRI string (one or more space-separated `algorithm-base64`
 * entries) into its supported hashes, unknown algorithms excluded.
 */
export function parseIntegrity (integrity: string): IntegrityHash[] {
  const hashes: IntegrityHash[] = []

  for (const entry of integrity.trim().split(/\s+/)) {
    const separator = entry.indexOf('-')
    if (separator === -1) {
      continue
    }
    const algorithm = entry.slice(0, separator)
    const digestBase64 = entry.slice(separator + 1)
    if (!SUPPORTED_ALGORITHMS.includes(algorithm) || digestBase64 === '') {
      continue
    }
    hashes.push({ algorithm, digestBase64 })
  }

  return hashes
}

/**
 * Returns the strongest supported hash of an SRI string, or undefined if
 * none of its entries use a supported algorithm.
 */
export function strongestIntegrityHash (integrity: string): IntegrityHash | undefined {
  const hashes = parseIntegrity(integrity)
  for (const algorithm of SUPPORTED_ALGORITHMS) {
    const match = hashes.find(hash => hash.algorithm === algorithm)
    if (match !== undefined) {
      return match
    }
  }
  return undefined
}

/**
 * Verifies content against an SRI string using its strongest supported
 * hash. Returns false when no supported hash is present.
 */
export function verifyIntegrity (content: Buffer, integrity: string): boolean {
  const hash = strongestIntegrityHash(integrity)
  if (hash === undefined) {
    return false
  }
  const digest = createHash(hash.algorithm).update(content).digest('base64')
  return digest === hash.digestBase64
}

/**
 * The hex encoding of an SRI hash's digest. npm's cacache stores content
 * under this encoding, e.g. `content-v2/sha512/<hex[0:2]>/<hex[2:4]>/<hex[4:]>`.
 */
export function integrityHashToHex (hash: IntegrityHash): string {
  return Buffer.from(hash.digestBase64, 'base64').toString('hex')
}
