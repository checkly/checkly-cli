import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  UnsupportedLockfileError,
  loadLockfilePackages,
  parseNpmLockfilePackages,
  parsePnpmLockfilePackages,
} from '../lockfile-packages.js'

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
  })
})

describe('parsePnpmLockfilePackages() dependency graph', () => {
  it('builds edges from v9 snapshots and roots from importers', () => {
    const { graph } = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      root-pkg:
        specifier: ^1.0.0
        version: 1.0.0
    devDependencies:
      '@acme/tool':
        specifier: ^2.0.0
        version: 2.0.0(react@18.2.0)
      linked-member:
        specifier: workspace:*
        version: link:packages/member
packages:
  root-pkg@1.0.0:
    resolution: {integrity: sha512-aaa}
  '@acme/tool@2.0.0':
    resolution: {integrity: sha512-bbb}
  mid@1.5.0:
    resolution: {integrity: sha512-ccc}
  leaf@0.3.0:
    resolution: {integrity: sha512-ddd}
snapshots:
  root-pkg@1.0.0:
    dependencies:
      mid: 1.5.0
  '@acme/tool@2.0.0(react@18.2.0)':
    dependencies:
      mid: 1.5.0
  mid@1.5.0:
    dependencies:
      leaf: 0.3.0
      git-dep: https://codeload.github.com/user/git-dep/tar.gz/abc123
  leaf@0.3.0: {}
`)
    expect([...graph.roots].sort()).toEqual(['@acme/tool@2.0.0', 'root-pkg@1.0.0'])
    expect([...graph.edges.get('root-pkg@1.0.0')!]).toEqual(['mid@1.5.0'])
    expect([...graph.edges.get('@acme/tool@2.0.0')!]).toEqual(['mid@1.5.0'])
    // The git dependency cannot be a registry entry, so it contributes no edge.
    expect([...graph.edges.get('mid@1.5.0')!]).toEqual(['leaf@0.3.0'])
    expect(graph.edges.has('leaf@0.3.0')).toBe(false)
  })

  it('unions edges across peer-variant snapshots of one version', () => {
    const { graph } = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
packages:
  dual@1.0.0:
    resolution: {integrity: sha512-aaa}
snapshots:
  dual@1.0.0(react@17.0.0):
    dependencies:
      left: 1.0.0
  dual@1.0.0(react@18.2.0):
    dependencies:
      right: 2.0.0
`)
    expect([...graph.edges.get('dual@1.0.0')!].sort()).toEqual(['left@1.0.0', 'right@2.0.0'])
  })

  it('resolves aliased dependency values to the real package', () => {
    const { graph } = parsePnpmLockfilePackages(`
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      my-alias:
        specifier: npm:real-name@^1.0.0
        version: real-name@1.0.0
packages:
  real-name@1.0.0:
    resolution: {integrity: sha512-aaa}
`)
    expect([...graph.roots]).toEqual(['real-name@1.0.0'])
  })

  it('collects roots from the document root of a v6 non-workspace lockfile', () => {
    const { graph } = parsePnpmLockfilePackages(`
lockfileVersion: '6.0'
dependencies:
  top:
    specifier: ^1.0.0
    version: 1.0.0
packages:
  /top@1.0.0:
    resolution: {integrity: sha512-aaa}
`)
    expect([...graph.roots]).toEqual(['top@1.0.0'])
  })

  it('records root-level link dependencies of a v6 non-workspace lockfile as excluded', () => {
    const { excluded } = parsePnpmLockfilePackages(`
lockfileVersion: '6.0'
dependencies:
  outside-pkg:
    specifier: link:../elsewhere
    version: link:../elsewhere
packages: {}
`)
    expect(excluded.map(entry => ({ name: entry.name, kind: entry.kind }))).toEqual([
      { name: 'outside-pkg', kind: 'unfetchable' },
    ])
  })

  it('builds edges from v6 inline package dependencies', () => {
    const { graph } = parsePnpmLockfilePackages(`
lockfileVersion: '6.0'
importers:
  .:
    dependencies:
      top:
        specifier: ^1.0.0
        version: 1.0.0
packages:
  /top@1.0.0:
    resolution: {integrity: sha512-aaa}
    dependencies:
      nested: 2.0.0
  /nested@2.0.0:
    resolution: {integrity: sha512-bbb}
`)
    expect([...graph.roots]).toEqual(['top@1.0.0'])
    expect([...graph.edges.get('top@1.0.0')!]).toEqual(['nested@2.0.0'])
  })
})

describe('parseNpmLockfilePackages() dependency graph', () => {
  it('resolves edges through node_modules nesting and collects member roots', () => {
    const { graph } = parseNpmLockfilePackages(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'root',
          version: '1.0.0',
          dependencies: { top: '^1.0.0' },
          devDependencies: { 'dev-tool': '^1.0.0' },
        },
        'packages/member': {
          name: 'member-pkg',
          version: '1.0.0',
          dependencies: { 'member-dep': '^3.0.0' },
        },
        'node_modules/member-pkg': { link: true, resolved: 'packages/member' },
        'node_modules/top': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/top/-/top-1.0.0.tgz',
          integrity: 'sha512-aaa',
          dependencies: { shared: '^1.0.0' },
        },
        'node_modules/dev-tool': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/dev-tool/-/dev-tool-1.0.0.tgz',
          integrity: 'sha512-bbb',
        },
        'node_modules/member-dep': {
          version: '3.0.0',
          resolved: 'https://registry.npmjs.org/member-dep/-/member-dep-3.0.0.tgz',
          integrity: 'sha512-ccc',
          dependencies: { shared: '^2.0.0' },
        },
        // member-dep needs a different major of shared, nested under it.
        'node_modules/member-dep/node_modules/shared': {
          version: '2.0.0',
          resolved: 'https://registry.npmjs.org/shared/-/shared-2.0.0.tgz',
          integrity: 'sha512-ddd',
        },
        'node_modules/shared': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/shared/-/shared-1.0.0.tgz',
          integrity: 'sha512-eee',
        },
      },
    }))
    expect([...graph.roots].sort()).toEqual(['dev-tool@1.0.0', 'member-dep@3.0.0', 'top@1.0.0'])
    expect([...graph.edges.get('top@1.0.0')!]).toEqual(['shared@1.0.0'])
    expect([...graph.edges.get('member-dep@3.0.0')!]).toEqual(['shared@2.0.0'])
  })

  it('resolves aliased dependencies to the real package name', () => {
    const { graph } = parseNpmLockfilePackages(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'root', version: '1.0.0', dependencies: { 'my-alias': 'npm:real-package@^1.0.0' } },
        'node_modules/my-alias': {
          name: 'real-package',
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/real-package/-/real-package-1.0.0.tgz',
          integrity: 'sha512-aaa',
        },
      },
    }))
    expect([...graph.roots]).toEqual(['real-package@1.0.0'])
  })

  it('excludes git-resolved entries from the graph entirely', () => {
    // A git-resolved copy shares name@version with a registry copy; its
    // dependencies must not be attributed to the registry package, and it
    // must not become an edge target either.
    const { graph } = parseNpmLockfilePackages(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'root', version: '1.0.0', dependencies: { forked: '^1.0.0' } },
        'node_modules/forked': {
          version: '1.0.0',
          resolved: 'git+ssh://git@github.com/acme/forked.git#abc',
          dependencies: { '@acme/internal': '^2.0.0' },
        },
        'node_modules/@acme/internal': {
          version: '2.0.0',
          resolved: 'https://registry.npmjs.org/@acme/internal/-/internal-2.0.0.tgz',
          integrity: 'sha512-aaa',
        },
      },
    }))
    expect(graph.edges.has('forked@1.0.0')).toBe(false)
    expect(graph.roots.has('forked@1.0.0')).toBe(false)
  })

  it('skips uninstalled optional peer dependencies', () => {
    const { graph } = parseNpmLockfilePackages(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'root', version: '1.0.0', dependencies: { plugin: '^1.0.0' } },
        'node_modules/plugin': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/plugin/-/plugin-1.0.0.tgz',
          integrity: 'sha512-aaa',
          peerDependencies: { 'absent-host': '^4.0.0' },
        },
      },
    }))
    expect(graph.edges.has('plugin@1.0.0')).toBe(false)
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
