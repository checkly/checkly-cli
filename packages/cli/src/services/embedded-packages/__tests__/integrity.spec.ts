import { createHash } from 'node:crypto'

import { describe, it, expect } from 'vitest'

import {
  integrityHashToHex,
  integrityIntersects,
  parseIntegrity,
  shasumToIntegrity,
  strongestIntegrityHash,
  verifyIntegrity,
} from '../integrity.js'

const content = Buffer.from('fake tarball content')
const sha512 = `sha512-${createHash('sha512').update(content).digest('base64')}`
const sha1 = `sha1-${createHash('sha1').update(content).digest('base64')}`

describe('parseIntegrity()', () => {
  it('parses a single sha512 entry', () => {
    expect(parseIntegrity(sha512)).toEqual([
      { algorithm: 'sha512', digestBase64: sha512.slice('sha512-'.length) },
    ])
  })

  it('parses multiple space-separated entries', () => {
    expect(parseIntegrity(`${sha1} ${sha512}`)).toHaveLength(2)
  })

  it('skips unsupported algorithms', () => {
    expect(parseIntegrity(`md5-abcdef ${sha512}`)).toHaveLength(1)
  })

  it('returns nothing for garbage', () => {
    expect(parseIntegrity('not-sri at all')).toEqual([])
  })
})

describe('strongestIntegrityHash()', () => {
  it('prefers sha512 over sha1 regardless of order', () => {
    expect(strongestIntegrityHash(`${sha1} ${sha512}`)?.algorithm).toBe('sha512')
    expect(strongestIntegrityHash(`${sha512} ${sha1}`)?.algorithm).toBe('sha512')
  })

  it('returns undefined when no supported hash exists', () => {
    expect(strongestIntegrityHash('md5-abcdef')).toBeUndefined()
  })
})

describe('verifyIntegrity()', () => {
  it('accepts matching sha512 content', () => {
    expect(verifyIntegrity(content, sha512)).toBe(true)
  })

  it('accepts matching sha1 content', () => {
    expect(verifyIntegrity(content, sha1)).toBe(true)
  })

  it('rejects tampered content', () => {
    expect(verifyIntegrity(Buffer.from('tampered'), sha512)).toBe(false)
  })

  it('rejects unsupported integrity strings', () => {
    expect(verifyIntegrity(content, 'md5-abcdef')).toBe(false)
  })
})

describe('integrityHashToHex()', () => {
  it('round-trips base64 to hex', () => {
    const hash = strongestIntegrityHash(sha512)!
    expect(integrityHashToHex(hash)).toBe(createHash('sha512').update(content).digest('hex'))
  })
})

describe('shasumToIntegrity()', () => {
  it('converts a hex sha1 shasum to its SRI form', () => {
    expect(shasumToIntegrity(createHash('sha1').update(content).digest('hex'))).toBe(sha1)
  })
})

describe('integrityIntersects()', () => {
  it('matches when a common algorithm agrees', () => {
    expect(integrityIntersects(sha512, `${sha1} ${sha512}`)).toBe(true)
    expect(integrityIntersects(sha1, `${sha1} ${sha512}`)).toBe(true)
  })

  it('rejects a disagreement on a common algorithm', () => {
    const other = `sha512-${createHash('sha512').update('other').digest('base64')}`
    expect(integrityIntersects(sha512, other)).toBe(false)
  })

  it('is false when no algorithm is shared (incomparable)', () => {
    expect(integrityIntersects(sha512, sha1)).toBe(false)
  })
})
