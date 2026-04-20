import { createHash } from 'node:crypto'

import { describe, test, expect } from 'vitest'

import {
  canonicalizePackageJson,
  composeCacheHash,
  stableJsonEncode,
} from '../cache-hash'

const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest()

const buf = (s: string): Buffer => Buffer.from(s, 'utf8')

describe('stableJsonEncode', () => {
  test('sorts object keys', () => {
    expect(stableJsonEncode({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  test('produces identical output regardless of source key order', () => {
    expect(stableJsonEncode({ a: 1, b: { d: 4, c: 3 } }))
      .toBe(stableJsonEncode({ b: { c: 3, d: 4 }, a: 1 }))
  })

  test('escapes HTML-significant characters', () => {
    expect(stableJsonEncode('<&>')).toBe('"\\u003c\\u0026\\u003e"')
  })

  test('escapes U+2028 and U+2029', () => {
    expect(stableJsonEncode('\u2028\u2029')).toBe('"\\u2028\\u2029"')
  })

  test('escapes control characters', () => {
    expect(stableJsonEncode('\u0000\u0001')).toBe('"\\u0000\\u0001"')
    expect(stableJsonEncode('\b\t\n\f\r')).toBe('"\\b\\t\\n\\f\\r"')
  })

  test('escapes quotes and backslashes', () => {
    expect(stableJsonEncode('a"b\\c')).toBe('"a\\"b\\\\c"')
  })

  test('encodes primitives', () => {
    expect(stableJsonEncode(null)).toBe('null')
    expect(stableJsonEncode(true)).toBe('true')
    expect(stableJsonEncode(false)).toBe('false')
    expect(stableJsonEncode(42)).toBe('42')
  })

  test('encodes arrays preserving order', () => {
    expect(stableJsonEncode([3, 1, 2])).toBe('[3,1,2]')
  })

  test('rejects non-finite numbers', () => {
    expect(() => stableJsonEncode(NaN)).toThrow()
    expect(() => stableJsonEncode(Infinity)).toThrow()
  })
})

describe('canonicalizePackageJson', () => {
  test('removes excluded top-level fields', () => {
    const raw = buf('{"name":"x","version":"1.0.0"}')
    expect(canonicalizePackageJson(raw, ['version']).toString('utf8'))
      .toBe('{"name":"x"}')
  })

  test('produces identical output regardless of source key order or whitespace', () => {
    const a = buf('{"name":"x","version":"1.0.0","main":"index.js"}')
    const b = buf('{\n  "main": "index.js",\n  "version": "9.9.9",\n  "name": "x"\n}\n')
    expect(canonicalizePackageJson(a, ['version']))
      .toEqual(canonicalizePackageJson(b, ['version']))
  })

  test('only excludes top-level fields, not nested ones', () => {
    const raw = buf('{"name":"x","version":"1.0.0","scripts":{"version":"echo 1"}}')
    const canonical = canonicalizePackageJson(raw, ['version']).toString('utf8')
    expect(canonical).toBe('{"name":"x","scripts":{"version":"echo 1"}}')
  })

  test('rejects non-object top-level values', () => {
    expect(() => canonicalizePackageJson(buf('[]'), [])).toThrow()
    expect(() => canonicalizePackageJson(buf('null'), [])).toThrow()
    expect(() => canonicalizePackageJson(buf('"x"'), [])).toThrow()
  })
})

describe('composeCacheHash', () => {
  test('bumping the excluded version field does not change the hash', () => {
    const v1 = buf('{"name":"x","version":"1.0.0"}')
    const v2 = buf('{"name":"x","version":"2.0.0-deadbeef"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    expect(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: v1 }],
      excludedFields: ['version'],
    })).toBe(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: v2 }],
      excludedFields: ['version'],
    }))
  })

  test('changing name or dependencies changes the hash', () => {
    const a = buf('{"name":"a","version":"1.0.0"}')
    const b = buf('{"name":"b","version":"1.0.0"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    expect(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: a }],
      excludedFields: ['version'],
    })).not.toBe(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: b }],
      excludedFields: ['version'],
    }))
  })

  test('source key reordering does not change the hash', () => {
    const a = buf('{"name":"x","version":"1.0.0","dependencies":{"a":"1","b":"2"}}')
    const b = buf('{"dependencies":{"b":"2","a":"1"},"version":"1.0.0","name":"x"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    expect(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: a }],
      excludedFields: ['version'],
    })).toBe(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: b }],
      excludedFields: ['version'],
    }))
  })

  test('adding a workspace package changes the hash', () => {
    const root = buf('{"name":"root","version":"1.0.0"}')
    const member = buf('{"name":"member","version":"1.0.0"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    const without = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
    })
    const withMember = composeCacheHash({
      lockfile,
      packageJsons: [
        { path: 'package.json', raw: root },
        { path: 'packages/member/package.json', raw: member },
      ],
      excludedFields: ['version'],
    })
    expect(without).not.toBe(withMember)
  })

  test('lockfile content change changes the hash', () => {
    const root = buf('{"name":"root"}')
    const a = composeCacheHash({
      lockfile: { name: 'package-lock.json', hash: sha256('lock-a') },
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
    })
    const b = composeCacheHash({
      lockfile: { name: 'package-lock.json', hash: sha256('lock-b') },
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
    })
    expect(a).not.toBe(b)
  })

  test('input order of packageJsons does not affect the hash', () => {
    const root = buf('{"name":"root"}')
    const a = buf('{"name":"a"}')
    const b = buf('{"name":"b"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    expect(composeCacheHash({
      lockfile,
      packageJsons: [
        { path: 'packages/b/package.json', raw: b },
        { path: 'package.json', raw: root },
        { path: 'packages/a/package.json', raw: a },
      ],
      excludedFields: ['version'],
    })).toBe(composeCacheHash({
      lockfile,
      packageJsons: [
        { path: 'package.json', raw: root },
        { path: 'packages/a/package.json', raw: a },
        { path: 'packages/b/package.json', raw: b },
      ],
      excludedFields: ['version'],
    }))
  })

  // Cross-language parity fixture. The same lockfile + package.json bytes
  // and the same excluded fields must produce this exact digest in
  // terraform-provider-checkly's composeBundleChecksum. If you change this
  // fixture, mirror the change in the TF provider's test suite.
  test('matches the cross-language parity fixture digest', () => {
    const lockfileBytes = buf('{"lockfileVersion":3}\n')
    const rootPackageJson = buf([
      '{',
      '  "name": "fixture-root",',
      '  "version": "0.0.0-SNAPSHOT",',
      '  "private": true,',
      '  "workspaces": ["packages/*"],',
      '  "devDependencies": {',
      '    "@playwright/test": "1.50.0"',
      '  }',
      '}',
      '',
    ].join('\n'))
    const memberPackageJson = buf([
      '{',
      '  "name": "@fixture/member",',
      '  "version": "9.9.9",',
      '  "main": "index.js",',
      '  "dependencies": {',
      '    "lodash": "^4.17.21"',
      '  }',
      '}',
      '',
    ].join('\n'))

    const digest = composeCacheHash({
      lockfile: {
        name: 'package-lock.json',
        hash: createHash('sha256').update(lockfileBytes).digest(),
      },
      packageJsons: [
        { path: 'package.json', raw: rootPackageJson },
        { path: 'packages/member/package.json', raw: memberPackageJson },
      ],
      excludedFields: ['version'],
    })

    expect(digest).toBe('4d3072de5db2f0f8a5e29b72013dd7e4dfb25686023931ee98050d58ba4503f8')
  })
})
