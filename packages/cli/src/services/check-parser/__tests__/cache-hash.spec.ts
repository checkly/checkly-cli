import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, test, expect, afterAll } from 'vitest'

import {
  canonicalizePackageJson,
  composeCacheHash,
  computeWorkspaceCacheHash,
  normalizeDependencyCacheVersion,
  stableJsonEncode,
} from '../cache-hash.js'
import { Package, Workspace } from '../package-files/workspace.js'
import { Err } from '../package-files/result.js'

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

  test('omitting npmrcs matches passing an empty array (no-op)', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    expect(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
    })).toBe(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      npmrcs: [],
      excludedFields: ['version'],
    }))
  })

  test('adding a root .npmrc changes the hash', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    const without = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
    })
    const withNpmrc = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      npmrcs: [{ path: '.npmrc', hash: sha256('registry=https://example.com/') }],
      excludedFields: ['version'],
    })
    expect(without).not.toBe(withNpmrc)
  })

  test('changing .npmrc content changes the hash', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    const a = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      npmrcs: [{ path: '.npmrc', hash: sha256('registry=https://a.example.com/') }],
      excludedFields: ['version'],
    })
    const b = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      npmrcs: [{ path: '.npmrc', hash: sha256('registry=https://b.example.com/') }],
      excludedFields: ['version'],
    })
    expect(a).not.toBe(b)
  })

  test('adding a member .npmrc changes the hash', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    const rootOnly = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      npmrcs: [{ path: '.npmrc', hash: sha256('root-npmrc') }],
      excludedFields: ['version'],
    })
    const withMember = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      npmrcs: [
        { path: '.npmrc', hash: sha256('root-npmrc') },
        { path: 'apps/main/.npmrc', hash: sha256('member-npmrc') },
      ],
      excludedFields: ['version'],
    })
    expect(rootOnly).not.toBe(withMember)
  })

  test('input order of npmrcs does not affect the hash', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    const a = { path: '.npmrc', hash: sha256('root-npmrc') }
    const b = { path: 'apps/main/.npmrc', hash: sha256('member-npmrc') }
    expect(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      npmrcs: [b, a],
      excludedFields: ['version'],
    })).toBe(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      npmrcs: [a, b],
      excludedFields: ['version'],
    }))
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

  test('omitting dependencyCacheVersion matches passing undefined or an empty string (no-op)', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    const base = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
    })
    expect(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
      dependencyCacheVersion: undefined,
    })).toBe(base)
    expect(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
      dependencyCacheVersion: '',
    })).toBe(base)
  })

  test('setting a dependencyCacheVersion changes the hash', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    const without = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
    })
    const withVersion = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
      dependencyCacheVersion: '1',
    })
    expect(without).not.toBe(withVersion)
  })

  test('omitting embeddedPackages matches passing an empty list (no-op)', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    expect(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
    })).toBe(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      embeddedPackages: [],
      excludedFields: ['version'],
    }))
  })

  test('adding an embedded package changes the hash', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    const without = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
    })
    const withEmbedded = composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      embeddedPackages: [{ name: '@acme/foo', version: '1.2.3', integrity: 'sha512-aaa' }],
      excludedFields: ['version'],
    })
    expect(without).not.toBe(withEmbedded)
  })

  test('embedded packages hash independently of their input order', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    const foo = { name: '@acme/foo', version: '1.2.3', integrity: 'sha512-aaa' }
    const bar = { name: 'bar', version: '2.0.0', integrity: 'sha512-bbb' }
    expect(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      embeddedPackages: [foo, bar],
      excludedFields: ['version'],
    })).toBe(composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      embeddedPackages: [bar, foo],
      excludedFields: ['version'],
    }))
  })

  test('changing an embedded package version or integrity changes the hash', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    const compose = (version: string, integrity: string) => composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      embeddedPackages: [{ name: '@acme/foo', version, integrity }],
      excludedFields: ['version'],
    })
    expect(compose('1.2.3', 'sha512-aaa')).toBe(compose('1.2.3', 'sha512-aaa'))
    expect(compose('1.2.3', 'sha512-aaa')).not.toBe(compose('1.2.4', 'sha512-aaa'))
    expect(compose('1.2.3', 'sha512-aaa')).not.toBe(compose('1.2.3', 'sha512-bbb'))
  })

  test('changing the dependencyCacheVersion changes the hash, same value is stable', () => {
    const root = buf('{"name":"root"}')
    const lockfile = { name: 'package-lock.json', hash: sha256('lock') }
    const compose = (dependencyCacheVersion: string) => composeCacheHash({
      lockfile,
      packageJsons: [{ path: 'package.json', raw: root }],
      excludedFields: ['version'],
      dependencyCacheVersion,
    })
    expect(compose('1')).toBe(compose('1'))
    expect(compose('1')).not.toBe(compose('2'))
  })

  // Cross-language parity fixture. The same lockfile + package.json bytes
  // and the same excluded fields must produce this exact digest in
  // terraform-provider-checkly's composeBundleChecksum. If you change this
  // fixture, mirror the change in the TF provider's test suite.
  //
  // NOTE: composeCacheHash also hashes `npmrc:` records (added for .npmrc
  // bundling), `embedded-package:` records (the resolved
  // checks.embeddedPackages tarball set), and a `dependency-cache-version`
  // record (the user-provided caching.dependencyCache.version config
  // value). This fixture uses none of them so the digest is unchanged, but
  // projects that DO have an .npmrc, embed packages, or set a dependency
  // cache version will hash differently until the TF provider mirrors
  // those record types. The fixture two tests down pins all three optional
  // record groups together, in order.
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

  // Same parity contract as above, but with an .npmrc and a dependency cache
  // version set, pinning the record order (npmrc records before the
  // dependency-cache-version record). The TF provider must produce this
  // exact digest once it mirrors both record types.
  test('matches the cross-language parity fixture digest with an npmrc and a dependency cache version', () => {
    const lockfileBytes = buf('{"lockfileVersion":3}\n')
    const rootPackageJson = buf([
      '{',
      '  "name": "fixture-root",',
      '  "version": "0.0.0-SNAPSHOT",',
      '  "private": true,',
      '  "devDependencies": {',
      '    "@playwright/test": "1.50.0"',
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
      ],
      npmrcs: [
        { path: '.npmrc', hash: sha256('registry=https://registry.example.com/\n') },
      ],
      excludedFields: ['version'],
      dependencyCacheVersion: '2',
    })

    expect(digest).toBe('344f037a55163ba59146d9cdb71ef702782e3690a9f666067c0ccdf091214eb6')
  })

  // Same parity contract as above, but with all four optional record groups
  // present, pinning the full record order (npmrc records, then
  // embedded-package records, then the dependency-cache-version record) and
  // the sort of the `name@version` record labels. The TF provider must
  // produce this exact digest once it mirrors the embedded-package record
  // type.
  test('matches the cross-language parity fixture digest with embedded packages', () => {
    const lockfileBytes = buf('{"lockfileVersion":3}\n')
    const rootPackageJson = buf([
      '{',
      '  "name": "fixture-root",',
      '  "version": "0.0.0-SNAPSHOT",',
      '  "private": true,',
      '  "dependencies": {',
      '    "@acme/foo": "1.2.3"',
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
      ],
      npmrcs: [
        { path: '.npmrc', hash: sha256('registry=https://registry.example.com/\n') },
      ],
      embeddedPackages: [
        { name: 'bar', version: '2.0.0', integrity: 'sha512-bbb' },
        { name: '@acme/foo', version: '1.2.3', integrity: 'sha512-aaa' },
      ],
      excludedFields: ['version'],
      dependencyCacheVersion: '2',
    })

    expect(digest).toBe('4d9ce4b49fe543b4ec303ae17b1e98c7c9d0e37d8e17c57e78b36555abdf5207')
  })
})

describe('computeWorkspaceCacheHash', () => {
  const tempDirs: string[] = []

  afterAll(async () => {
    await Promise.all(tempDirs.map(dir => fs.rm(dir, { recursive: true, force: true })))
  })

  const makeWorkspace = async (): Promise<Workspace> => {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cache-hash-')))
    tempDirs.push(dir)
    await fs.writeFile(path.join(dir, 'package.json'), '{"name":"fixture-root"}\n')
    return new Workspace({
      root: new Package({ name: 'fixture-root', path: dir }),
      packages: [],
      lockfile: Err(new Error('no lockfile')),
      configFile: Err(new Error('no config file')),
    })
  }

  test('dependencyCacheVersion option flows into the hash', async () => {
    const workspace = await makeWorkspace()
    const base = await computeWorkspaceCacheHash(workspace)
    expect(base).toBe(await computeWorkspaceCacheHash(workspace, {}))
    expect(base).toBe(await computeWorkspaceCacheHash(workspace, { dependencyCacheVersion: '' }))
    expect(base).not.toBe(await computeWorkspaceCacheHash(workspace, { dependencyCacheVersion: 'v2' }))
  })

  test('a number and its string form produce the same hash', async () => {
    const workspace = await makeWorkspace()
    expect(await computeWorkspaceCacheHash(workspace, { dependencyCacheVersion: 2 }))
      .toBe(await computeWorkspaceCacheHash(workspace, { dependencyCacheVersion: '2' }))
  })

  test('embeddedPackages option flows into the hash', async () => {
    const workspace = await makeWorkspace()
    const base = await computeWorkspaceCacheHash(workspace)
    expect(base).toBe(await computeWorkspaceCacheHash(workspace, { embeddedPackages: [] }))
    expect(base).not.toBe(await computeWorkspaceCacheHash(workspace, {
      embeddedPackages: [{ name: '@acme/foo', version: '1.2.3', integrity: 'sha512-aaa' }],
    }))
  })
})

describe('normalizeDependencyCacheVersion', () => {
  test('passes strings through unchanged', () => {
    expect(normalizeDependencyCacheVersion('v2')).toBe('v2')
  })

  test('treats undefined and empty string as unset', () => {
    expect(normalizeDependencyCacheVersion(undefined)).toBeUndefined()
    expect(normalizeDependencyCacheVersion('')).toBeUndefined()
  })

  test('stringifies safe integers, including 0 and negatives', () => {
    expect(normalizeDependencyCacheVersion(1)).toBe('1')
    expect(normalizeDependencyCacheVersion(0)).toBe('0')
    expect(normalizeDependencyCacheVersion(-3)).toBe('-3')
  })

  test('a number and its string form normalize identically', () => {
    expect(normalizeDependencyCacheVersion(1)).toBe(normalizeDependencyCacheVersion('1'))
  })

  test('rejects unsafe or non-integer numbers', () => {
    expect(() => normalizeDependencyCacheVersion(1.5)).toThrow()
    expect(() => normalizeDependencyCacheVersion(1e21)).toThrow()
    expect(() => normalizeDependencyCacheVersion(2 ** 53)).toThrow()
    expect(() => normalizeDependencyCacheVersion(NaN)).toThrow()
    expect(() => normalizeDependencyCacheVersion(Infinity)).toThrow()
  })

  test('rejects values that are neither string nor number', () => {
    expect(() => normalizeDependencyCacheVersion(null as any)).toThrow()
    expect(() => normalizeDependencyCacheVersion(true as any)).toThrow()
    expect(() => normalizeDependencyCacheVersion({} as any)).toThrow()
  })
})
