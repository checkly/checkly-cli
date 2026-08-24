import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  UnsupportedLockfileError,
  isPnpmLockfile,
  loadLockfilePackages,
  parseBunLockfilePackages,
  parseLockfilePackagesContent,
  parseNpmLockfilePackages,
  parsePnpmLockfilePackages,
  parseYarnLockfilePackages,
} from '../lockfile-packages.js'

describe('isPnpmLockfile()', () => {
  it('recognizes a pnpm lockfile by basename', () => {
    expect(isPnpmLockfile('pnpm-lock.yaml')).toBe(true)
    expect(isPnpmLockfile(path.join('/ws', 'pnpm-lock.yaml'))).toBe(true)
  })

  it('rejects other lockfiles', () => {
    expect(isPnpmLockfile(path.join('/ws', 'package-lock.json'))).toBe(false)
    expect(isPnpmLockfile(path.join('/ws', 'yarn.lock'))).toBe(false)
    expect(isPnpmLockfile(path.join('/ws', 'bun.lock'))).toBe(false)
  })

  it('does not match a directory that merely contains the name', () => {
    expect(isPnpmLockfile(path.join('/ws', 'pnpm-lock.yaml', 'nested.json'))).toBe(false)
  })
})

describe('parsePnpmLockfilePackages()', () => {
  it('parses v9 registry entries', () => {
    const { registry, excluded } = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
packages:
  '@acme/foo@1.2.3':
    resolution: {integrity: sha512-aaa}
  bar@2.0.0:
    resolution: {integrity: sha512-bbb}
`)
    expect(registry).toEqual([
      { name: '@acme/foo', version: '1.2.3', integrity: 'sha512-aaa', tarballUrl: undefined },
      { name: 'bar', version: '2.0.0', integrity: 'sha512-bbb', tarballUrl: undefined },
    ])
    expect(excluded).toEqual([])
  })

  it('parses v6 keys with leading slash and peer suffixes, deduplicating', () => {
    const { registry } = parsePnpmLockfilePackages(`
lockfileVersion: '6.0'
packages:
  /@acme/foo@1.2.3(react@18.2.0):
    resolution: {integrity: sha512-aaa}
  /@acme/foo@1.2.3(react@17.0.0):
    resolution: {integrity: sha512-aaa}
`)
    expect(registry).toEqual([
      { name: '@acme/foo', version: '1.2.3', integrity: 'sha512-aaa', tarballUrl: undefined },
    ])
  })

  it('records a resolution tarball URL when present', () => {
    const { registry } = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
packages:
  bar@2.0.0:
    resolution: {integrity: sha512-bbb, tarball: https://nexus.local/repository/npm/bar/-/bar-2.0.0.tgz}
`)
    expect(registry[0].tarballUrl).toBe('https://nexus.local/repository/npm/bar/-/bar-2.0.0.tgz')
  })

  it('excludes git and file dependencies with a reason', () => {
    const { registry, excluded } = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
packages:
  'foo@https://codeload.github.com/user/foo/tar.gz/abc123':
    resolution: {tarball: https://codeload.github.com/user/foo/tar.gz/abc123}
  'baz@file:vendor/baz':
    resolution: {directory: vendor/baz, type: directory}
`)
    expect(registry).toEqual([])
    expect(excluded).toHaveLength(2)
    expect(excluded[0].name).toBe('foo')
    expect(excluded[0].reason).toContain('git, file or URL dependency')
  })

  it('keeps the package name intact when a git ref itself contains @', () => {
    const { excluded } = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
packages:
  'foo@git+ssh://git@github.com/user/foo.git#abc123':
    resolution: {commit: abc123, repo: git+ssh://git@github.com/user/foo.git}
  '@acme/bar@git+ssh://git@github.com/acme/bar.git#def456':
    resolution: {commit: def456, repo: git+ssh://git@github.com/acme/bar.git}
`)
    expect(excluded.map(entry => entry.name).sort()).toEqual(['@acme/bar', 'foo'])
  })

  it('excludes entries without an integrity hash', () => {
    const { registry, excluded } = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
packages:
  bar@2.0.0:
    resolution: {}
`)
    expect(registry).toEqual([])
    expect(excluded[0].reason).toContain('no integrity hash')
  })

  it('accepts an unquoted lockfileVersion that YAML reads as a number', () => {
    const { registry } = parsePnpmLockfilePackages(`
lockfileVersion: 9.0
packages:
  bar@2.0.0:
    resolution: {integrity: sha512-bbb}
`)
    expect(registry).toHaveLength(1)
  })

  it('falls back to the derived URL for a non-http resolution tarball', () => {
    const { registry } = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
packages:
  bar@2.0.0:
    resolution: {integrity: sha512-bbb, tarball: file:vendor/bar-2.0.0.tgz}
`)
    expect(registry[0].tarballUrl).toBeUndefined()
  })

  it('rejects unsupported lockfile versions', () => {
    expect(() => parsePnpmLockfilePackages(`lockfileVersion: 5.4`)).toThrow(UnsupportedLockfileError)
  })
})

describe('parseNpmLockfilePackages()', () => {
  it('parses v3 registry entries, skipping the root and member paths', () => {
    const { registry, excluded } = parseNpmLockfilePackages(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'root', version: '1.0.0' },
        'packages/a': { name: 'member-a', version: '1.0.0' },
        'node_modules/@acme/foo': {
          version: '1.2.3',
          resolved: 'https://registry.npmjs.org/@acme/foo/-/foo-1.2.3.tgz',
          integrity: 'sha512-aaa',
        },
        'node_modules/a/node_modules/bar': {
          version: '2.0.0',
          resolved: 'https://registry.npmjs.org/bar/-/bar-2.0.0.tgz',
          integrity: 'sha512-bbb',
        },
      },
    }))
    expect(registry).toEqual([
      {
        name: '@acme/foo',
        version: '1.2.3',
        integrity: 'sha512-aaa',
        tarballUrl: 'https://registry.npmjs.org/@acme/foo/-/foo-1.2.3.tgz',
      },
      {
        name: 'bar',
        version: '2.0.0',
        integrity: 'sha512-bbb',
        tarballUrl: 'https://registry.npmjs.org/bar/-/bar-2.0.0.tgz',
      },
    ])
    expect(excluded).toEqual([])
  })

  it('excludes workspace links, git dependencies and integrity-less entries', () => {
    const { registry, excluded } = parseNpmLockfilePackages(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        'node_modules/member-a': { resolved: 'packages/a', link: true },
        'node_modules/git-dep': { version: '1.0.0', resolved: 'git+ssh://git@github.com/user/git-dep.git#abc' },
        'node_modules/bundled-dep': { version: '3.0.0', inBundle: true },
      },
    }))
    expect(registry).toEqual([])
    expect(excluded.map(entry => entry.name).sort()).toEqual(['bundled-dep', 'git-dep', 'member-a'])
    expect(excluded.find(entry => entry.name === 'member-a')?.reason).toContain('workspace link')
    expect(excluded.find(entry => entry.name === 'bundled-dep')?.reason).toContain('no integrity hash')
  })

  it('does not let an integrity-less duplicate shadow a real registry entry', () => {
    const { registry } = parseNpmLockfilePackages(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        // A nested bundled copy without integrity sorts before the real
        // hoisted entry of the same name@version.
        'node_modules/a/node_modules/dep': { version: '1.0.0', inBundle: true },
        'node_modules/dep': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/dep/-/dep-1.0.0.tgz',
          integrity: 'sha512-ddd',
        },
      },
    }))
    expect(registry).toEqual([
      {
        name: 'dep',
        version: '1.0.0',
        integrity: 'sha512-ddd',
        tarballUrl: 'https://registry.npmjs.org/dep/-/dep-1.0.0.tgz',
      },
    ])
  })

  it('uses the real package name for aliased installs', () => {
    const { registry } = parseNpmLockfilePackages(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        'node_modules/my-alias': {
          name: 'real-package',
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/real-package/-/real-package-1.0.0.tgz',
          integrity: 'sha512-ccc',
        },
      },
    }))
    expect(registry[0].name).toBe('real-package')
  })

  it('rejects v1 lockfiles', () => {
    expect(() => parseNpmLockfilePackages(JSON.stringify({ lockfileVersion: 1 })))
      .toThrow(UnsupportedLockfileError)
  })
})

describe('parseBunLockfilePackages()', () => {
  it('parses registry entries, with and without an explicit tarball URL', () => {
    // Trailing commas throughout: bun.lock is JSONC, and the parser must
    // accept bun's own serialization.
    const { registry, excluded } = parseBunLockfilePackages(`{
      "lockfileVersion": 1,
      "configVersion": 1,
      "workspaces": {
        "": { "name": "root" },
      },
      "packages": {
        "@acme/foo": ["@acme/foo@1.2.3", "", {}, "sha512-aaa"],
        "bar": ["bar@2.0.0", "https://nexus.local/repository/npm/bar/-/bar-2.0.0.tgz", {}, "sha512-bbb"],
      },
    }`)
    expect(registry).toEqual([
      { name: '@acme/foo', version: '1.2.3', integrity: 'sha512-aaa', tarballUrl: undefined },
      { name: 'bar', version: '2.0.0', integrity: 'sha512-bbb', tarballUrl: 'https://nexus.local/repository/npm/bar/-/bar-2.0.0.tgz' },
    ])
    expect(excluded).toEqual([])
  })

  it('falls back to the derived URL for a non-http tarball element', () => {
    const { registry } = parseBunLockfilePackages(JSON.stringify({
      lockfileVersion: 1,
      packages: {
        bar: ['bar@2.0.0', 'file:vendor/bar-2.0.0.tgz', {}, 'sha512-bbb'],
      },
    }))
    expect(registry[0].tarballUrl).toBeUndefined()
  })

  it('excludes workspace packages with a precise reason', () => {
    const { registry, excluded } = parseBunLockfilePackages(JSON.stringify({
      lockfileVersion: 1,
      packages: {
        '@acme/shared': ['@acme/shared@workspace:packages/shared'],
        'bar': ['bar@2.0.0', '', {}, 'sha512-bbb'],
      },
    }))
    expect(registry).toHaveLength(1)
    expect(excluded).toEqual([
      {
        name: '@acme/shared',
        reason: `'@acme/shared' is a workspace package, which cannot be embedded as a registry tarball`,
        kind: 'workspace',
      },
    ])
  })

  it('excludes git, remote tarball and file dependencies with a reason', () => {
    // Non-registry tuples have kind-dependent arities (git entries carry
    // their dependency object at index 1); classification must not trust
    // any index beyond the name@ref element.
    const { registry, excluded } = parseBunLockfilePackages(JSON.stringify({
      lockfileVersion: 1,
      packages: {
        isarray: ['isarray@github:juliangruber/isarray#31d8230', {}, 'juliangruber-isarray-31d8230', 'sha512-xxx'],
        mstar: ['ms@https://registry.npmjs.org/ms/-/ms-2.1.3.tgz', {}, 'sha512-yyy'],
        baz: ['baz@file:vendor/baz', {}],
      },
    }))
    expect(registry).toEqual([])
    expect(excluded.map(entry => entry.name).sort()).toEqual(['baz', 'isarray', 'ms'])
    expect(excluded[0].reason).toContain('git, file or URL dependency')
  })

  it('keeps the package name intact when a git ref itself contains @', () => {
    const { excluded } = parseBunLockfilePackages(JSON.stringify({
      lockfileVersion: 1,
      packages: {
        'foo': ['foo@git+ssh://git@github.com/user/foo.git#abc123', {}, 'user-foo-abc123', 'sha512-xxx'],
        '@acme/bar': ['@acme/bar@git+ssh://git@github.com/acme/bar.git#def456', {}, 'acme-bar-def456', 'sha512-yyy'],
      },
    }))
    expect(excluded.map(entry => entry.name).sort()).toEqual(['@acme/bar', 'foo'])
  })

  it('uses the real package name for aliased installs, deduplicating', () => {
    // An alias key records the real name@version in its tuple, so an alias
    // and a direct dependency on the same package parse into one entry.
    const { registry } = parseBunLockfilePackages(JSON.stringify({
      lockfileVersion: 1,
      packages: {
        ms: ['ms@2.1.3', '', {}, 'sha512-aaa'],
        msa: ['ms@2.1.3', '', {}, 'sha512-aaa'],
      },
    }))
    expect(registry).toEqual([
      { name: 'ms', version: '2.1.3', integrity: 'sha512-aaa', tarballUrl: undefined },
    ])
  })

  it('excludes entries without an integrity hash', () => {
    const { registry, excluded } = parseBunLockfilePackages(JSON.stringify({
      lockfileVersion: 1,
      packages: {
        bar: ['bar@2.0.0', '', {}],
      },
    }))
    expect(registry).toEqual([])
    expect(excluded[0].reason).toContain('no integrity hash')
  })

  it('skips malformed package values without failing', () => {
    const { registry, excluded } = parseBunLockfilePackages(JSON.stringify({
      lockfileVersion: 1,
      packages: {
        'not-a-tuple': { some: 'object' },
        'empty-tuple': [],
        'no-separator': ['plainstring'],
        'bar': ['bar@2.0.0', '', {}, 'sha512-bbb'],
      },
    }))
    expect(registry.map(pkg => pkg.name)).toEqual(['bar'])
    expect(excluded).toEqual([])
  })

  it('rejects unsupported lockfile versions', () => {
    expect(() => parseBunLockfilePackages(JSON.stringify({ lockfileVersion: 0 })))
      .toThrow(UnsupportedLockfileError)
  })
})

describe('parseYarnLockfilePackages()', () => {
  it('parses registry entries, recording the Berry checksum instead of an integrity', () => {
    const { registry, excluded } = parseYarnLockfilePackages(`
__metadata:
  version: 10
  cacheKey: 10c0

"@acme/foo@npm:^1.0.0":
  version: 1.2.3
  resolution: "@acme/foo@npm:1.2.3"
  checksum: 10c0/aaa
  languageName: node
  linkType: hard

"bar@npm:2.0.0":
  version: 2.0.0
  resolution: "bar@npm:2.0.0"
  checksum: 10c0/bbb
  languageName: node
  linkType: hard
`)
    expect(registry).toEqual([
      { name: '@acme/foo', version: '1.2.3', lockfileChecksum: '10c0/aaa' },
      { name: 'bar', version: '2.0.0', lockfileChecksum: '10c0/bbb' },
    ])
    expect(registry.every(entry => entry.integrity === undefined)).toBe(true)
    expect(excluded).toEqual([])
  })

  it('excludes workspace packages with a precise reason', () => {
    const { registry, excluded } = parseYarnLockfilePackages(`
__metadata:
  version: 10
  cacheKey: 10c0

"@acme/shared@workspace:*, @acme/shared@workspace:packages/shared":
  version: 0.0.0-use.local
  resolution: "@acme/shared@workspace:packages/shared"
  languageName: unknown
  linkType: soft

"bar@npm:2.0.0":
  version: 2.0.0
  resolution: "bar@npm:2.0.0"
  checksum: 10c0/bbb
  languageName: node
  linkType: hard
`)
    expect(registry).toHaveLength(1)
    expect(excluded).toEqual([
      {
        name: '@acme/shared',
        reason: `'@acme/shared' is a workspace package, which cannot be embedded as a registry tarball`,
        kind: 'workspace',
      },
    ])
  })

  it('distinguishes in-workspace directory links from escaping ones', () => {
    const { excluded } = parseYarnLockfilePackages(`
__metadata:
  version: 10
  cacheKey: 10c0

"inside@portal:./tools/inside::locator=root%40workspace%3A.":
  version: 0.0.0-use.local
  resolution: "inside@portal:./tools/inside::locator=root%40workspace%3A."
  languageName: node
  linkType: soft

"outside@link:../elsewhere::locator=root%40workspace%3A.":
  version: 0.0.0-use.local
  resolution: "outside@link:../elsewhere::locator=root%40workspace%3A."
  languageName: node
  linkType: soft
`)
    expect(excluded).toEqual([
      {
        name: 'inside',
        reason: `'inside' is a workspace package, which cannot be embedded as a registry tarball`,
        kind: 'workspace',
      },
      {
        name: 'outside',
        reason: `'outside' is a local directory link outside the workspace, which cannot be embedded`
          + ` as a registry tarball`,
        kind: 'unfetchable',
      },
    ])
  })

  it('excludes git, remote tarball, file and patched dependencies with a reason', () => {
    const { registry, excluded } = parseYarnLockfilePackages(`
__metadata:
  version: 10
  cacheKey: 10c0

"mimic-response@github:sindresorhus/mimic-response#v3.1.0":
  version: 3.1.0
  resolution: "mimic-response@https://github.com/sindresorhus/mimic-response.git#commit=c781ec5"
  checksum: 10c0/ccc
  languageName: node
  linkType: hard

"resolve@patch:resolve@npm%3A1.22.8#optional!builtin<compat/resolve>":
  version: 1.22.8
  resolution: "resolve@patch:resolve@npm%3A1.22.8#optional!builtin<compat/resolve>::version=1.22.8&hash=9bd1a5"
  checksum: 10c0/ddd
  languageName: node
  linkType: hard

"vendored@file:./vendor/vendored-1.0.0.tgz::locator=root%40workspace%3A.":
  version: 1.0.0
  resolution: "vendored@file:./vendor/vendored-1.0.0.tgz::locator=root%40workspace%3A."
  checksum: 10c0/eee
  languageName: node
  linkType: hard
`)
    expect(registry).toEqual([])
    expect(excluded.map(entry => entry.name).sort()).toEqual(['mimic-response', 'resolve', 'vendored'])
    expect(excluded[0].reason).toContain('git, file, URL or patched dependency')
  })

  it('keeps the package name intact when a git ref itself contains @', () => {
    const { excluded } = parseYarnLockfilePackages(`
__metadata:
  version: 10
  cacheKey: 10c0

"foo@git+ssh://git@github.com/user/foo.git#abc123":
  version: 1.0.0
  resolution: "foo@git+ssh://git@github.com/user/foo.git#commit=abc123"
  checksum: 10c0/fff
  languageName: node
  linkType: hard

"@acme/bar@git+ssh://git@github.com/acme/bar.git#def456":
  version: 1.0.0
  resolution: "@acme/bar@git+ssh://git@github.com/acme/bar.git#commit=def456"
  checksum: 10c0/ggg
  languageName: node
  linkType: hard
`)
    expect(excluded.map(entry => entry.name).sort()).toEqual(['@acme/bar', 'foo'])
  })

  it('uses the real package name for aliased installs, deduplicating', () => {
    // An alias key records the real name@version locator in `resolution`,
    // so an alias and a direct dependency parse into one entry.
    const { registry } = parseYarnLockfilePackages(`
__metadata:
  version: 10
  cacheKey: 10c0

"ms@npm:2.1.3":
  version: 2.1.3
  resolution: "ms@npm:2.1.3"
  checksum: 10c0/aaa
  languageName: node
  linkType: hard

"msalias@npm:ms@2.1.3":
  version: 2.1.3
  resolution: "ms@npm:2.1.3"
  checksum: 10c0/aaa
  languageName: node
  linkType: hard
`)
    expect(registry).toEqual([
      { name: 'ms', version: '2.1.3', lockfileChecksum: '10c0/aaa' },
    ])
  })

  it('keeps build metadata in versions as written', () => {
    const { registry } = parseYarnLockfilePackages(`
__metadata:
  version: 10
  cacheKey: 10c0

"built@npm:1.0.0+sha.abc":
  version: 1.0.0+sha.abc
  resolution: "built@npm:1.0.0+sha.abc"
  checksum: 10c0/hhh
  languageName: node
  linkType: hard
`)
    expect(registry).toEqual([
      { name: 'built', version: '1.0.0+sha.abc', lockfileChecksum: '10c0/hhh' },
    ])
  })

  it('excludes entries without a checksum', () => {
    // checksumBehavior: ignore makes yarn omit checksums, leaving nothing
    // to pin the content with.
    const { registry, excluded } = parseYarnLockfilePackages(`
__metadata:
  version: 10
  cacheKey: 10c0

"bar@npm:2.0.0":
  version: 2.0.0
  resolution: "bar@npm:2.0.0"
  languageName: node
  linkType: hard
`)
    expect(registry).toEqual([])
    expect(excluded[0].reason).toContain('no checksum')
  })

  it('skips malformed entries without failing', () => {
    const { registry, excluded } = parseYarnLockfilePackages(`
__metadata:
  version: 10
  cacheKey: 10c0

"no-resolution@npm:1.0.0":
  version: 1.0.0

"no-separator@npm:1.0.0":
  version: 1.0.0
  resolution: "plainstring"

"bar@npm:2.0.0":
  version: 2.0.0
  resolution: "bar@npm:2.0.0"
  checksum: 10c0/bbb
  languageName: node
  linkType: hard
`)
    expect(registry.map(pkg => pkg.name)).toEqual(['bar'])
    expect(excluded).toEqual([])
  })

  it('rejects Yarn Classic lockfiles with a migration hint', () => {
    expect(() => parseYarnLockfilePackages(`# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
# yarn lockfile v1


ms@2.1.3:
  version "2.1.3"
  resolved "https://registry.yarnpkg.com/ms/-/ms-2.1.3.tgz#574c8138"
`)).toThrow(/Yarn Classic/)
  })
})

describe('parsePnpmLockfilePackages() workspace links', () => {
  it('records workspace-linked packages as excluded with a precise reason', () => {
    const { registry, excluded } = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@acme/shared':
        specifier: workspace:*
        version: link:packages/shared
packages:
  bar@2.0.0:
    resolution: {integrity: sha512-bbb}
`)
    expect(registry).toHaveLength(1)
    expect(excluded).toEqual([
      {
        name: '@acme/shared',
        reason: `'@acme/shared' is a workspace package, which cannot be embedded as a registry tarball`,
        kind: 'workspace',
      },
    ])
  })
})

describe('parsePnpmLockfilePackages() outside links', () => {
  it('distinguishes workspace links from links escaping the workspace', () => {
    const { excluded } = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@acme/member':
        specifier: workspace:*
        version: link:packages/member
      '@acme/outside':
        specifier: file:../elsewhere
        version: link:../elsewhere
packages: {}
`)
    expect(excluded.map(entry => ({ name: entry.name, kind: entry.kind }))).toEqual([
      { name: '@acme/member', kind: 'workspace' },
      { name: '@acme/outside', kind: 'unfetchable' },
    ])
  })
})

describe('parseNpmLockfilePackages() links', () => {
  it('distinguishes workspace links from links escaping the workspace', () => {
    const { excluded } = parseNpmLockfilePackages(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        'node_modules/@acme/member': { link: true, resolved: 'packages/member' },
        'node_modules/@acme/outside': { link: true, resolved: '../elsewhere/outside' },
      },
    }))
    expect(excluded.map(entry => ({ name: entry.name, kind: entry.kind }))).toEqual([
      { name: '@acme/member', kind: 'workspace' },
      { name: '@acme/outside', kind: 'unfetchable' },
    ])
  })
})

describe('build metadata in versions', () => {
  it('keeps build metadata as recorded in the lockfile', () => {
    const pnpm = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
packages:
  'meta-pkg@1.0.0+sha.abcdef':
    resolution: {integrity: sha512-eee}
`)
    expect(pnpm.registry[0].version).toBe('1.0.0+sha.abcdef')

    const npm = parseNpmLockfilePackages(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        'node_modules/meta-pkg': {
          version: '1.0.0+sha.abcdef',
          resolved: 'https://registry.npmjs.org/meta-pkg/-/meta-pkg-1.0.0+sha.abcdef.tgz',
          integrity: 'sha512-eee',
        },
      },
    }))
    expect(npm.registry[0].version).toBe('1.0.0+sha.abcdef')

    const bun = parseBunLockfilePackages(JSON.stringify({
      lockfileVersion: 1,
      packages: {
        'meta-pkg': ['meta-pkg@1.0.0+sha.abcdef', '', {}, 'sha512-eee'],
      },
    }))
    expect(bun.registry[0].version).toBe('1.0.0+sha.abcdef')
  })
})

describe('loadLockfilePackages()', () => {
  it('dispatches package-lock.json to the npm parser', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-lockfile-'))
    try {
      const lockfilePath = path.join(dir, 'package-lock.json')
      await fs.writeFile(lockfilePath, JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/bar': {
            version: '2.0.0',
            resolved: 'https://registry.npmjs.org/bar/-/bar-2.0.0.tgz',
            integrity: 'sha512-bbb',
          },
        },
      }))
      const { registry } = await loadLockfilePackages(lockfilePath)
      expect(registry).toHaveLength(1)
      expect(registry[0].name).toBe('bar')
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('parseLockfilePackagesContent()', () => {
  it('dispatches on the lockfile name for every supported format', () => {
    const pnpm = parseLockfilePackagesContent(`
lockfileVersion: '9.0'
packages:
  foo@1.0.0:
    resolution: {integrity: sha512-aaa}
`, 'pnpm-lock.yaml')
    expect(pnpm.registry.map(pkg => pkg.name)).toEqual(['foo'])

    const npm = parseLockfilePackagesContent(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        'node_modules/bar': {
          version: '2.0.0',
          resolved: 'https://registry.npmjs.org/bar/-/bar-2.0.0.tgz',
          integrity: 'sha512-bbb',
        },
      },
    }), 'package-lock.json')
    expect(npm.registry.map(pkg => pkg.name)).toEqual(['bar'])

    const bun = parseLockfilePackagesContent(JSON.stringify({
      lockfileVersion: 1,
      packages: {
        baz: ['baz@3.0.0', '', {}, 'sha512-ccc'],
      },
    }), 'bun.lock')
    expect(bun.registry.map(pkg => pkg.name)).toEqual(['baz'])

    const yarn = parseLockfilePackagesContent(`
__metadata:
  version: 10
  cacheKey: 10c0

"qux@npm:4.0.0":
  version: 4.0.0
  resolution: "qux@npm:4.0.0"
  checksum: 10c0/ddd
  languageName: node
  linkType: hard
`, 'yarn.lock')
    expect(yarn.registry.map(pkg => pkg.name)).toEqual(['qux'])
  })

  it('rejects unsupported lockfile names', () => {
    expect(() => parseLockfilePackagesContent('', 'deno.lock')).toThrow(UnsupportedLockfileError)
  })

  it('rejects the binary bun lockfile with a remedy', () => {
    expect(() => parseLockfilePackagesContent('', 'bun.lockb'))
      .toThrow(/bun install --save-text-lockfile/)
  })
})
