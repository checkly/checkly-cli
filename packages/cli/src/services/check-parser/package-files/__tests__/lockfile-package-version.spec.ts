import { describe, it, expect } from 'vitest'

import {
  parseBunLockfileVersion,
  parseNpmLockfileVersion,
  parsePnpmLockfileVersion,
  parseYarnLockfileVersion,
} from '../lockfile-package-version.js'

const PKG = '@playwright/test'

// All fixtures below mirror the real output of each package manager (verified
// by generating lockfiles for a workspace with two members declaring
// conflicting @playwright/test versions: the root and pkg-b on 1.40.0, pkg-a
// on 1.41.0).

describe('parseNpmLockfileVersion (package-lock.json v2/v3)', () => {
  const lockfile = JSON.stringify({
    name: 'root',
    lockfileVersion: 3,
    packages: {
      '': { name: 'root', workspaces: ['packages/*'] },
      'node_modules/@playwright/test': { version: '1.40.0' },
      'packages/a/node_modules/@playwright/test': { version: '1.41.0' },
      'packages/a': { name: 'pkg-a' },
      'packages/b': { name: 'pkg-b' },
    },
  })

  it('resolves the hoisted version for the root importer', () => {
    expect(parseNpmLockfileVersion(lockfile, { packageName: PKG, importerRelPath: '.' }))
      .toBe('1.40.0')
  })

  it('resolves a member-specific nested version', () => {
    expect(parseNpmLockfileVersion(lockfile, { packageName: PKG, importerRelPath: 'packages/a' }))
      .toBe('1.41.0')
  })

  it('walks up to the hoisted version when a member has no nested entry', () => {
    expect(parseNpmLockfileVersion(lockfile, { packageName: PKG, importerRelPath: 'packages/b' }))
      .toBe('1.40.0')
  })

  it('returns undefined when the package is absent', () => {
    expect(parseNpmLockfileVersion(lockfile, { packageName: 'missing-pkg', importerRelPath: '.' }))
      .toBeUndefined()
  })

  it('returns undefined for lockfileVersion 1 (no packages map)', () => {
    const v1 = JSON.stringify({
      name: 'root',
      lockfileVersion: 1,
      dependencies: { '@playwright/test': { version: '1.40.0' } },
    })
    expect(parseNpmLockfileVersion(v1, { packageName: PKG, importerRelPath: '.' }))
      .toBeUndefined()
  })
})

describe('parsePnpmLockfileVersion (pnpm-lock.yaml)', () => {
  const lockfile = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true

importers:

  .:
    devDependencies:
      '@playwright/test':
        specifier: 1.40.0
        version: 1.40.0

  packages/a:
    dependencies:
      '@playwright/test':
        specifier: 1.41.0
        version: 1.41.0

  packages/b:
    dependencies:
      '@playwright/test':
        specifier: 1.40.0
        version: 1.40.0
`

  it('resolves the version for the root importer', () => {
    expect(parsePnpmLockfileVersion(lockfile, { packageName: PKG, importerRelPath: '.' }))
      .toBe('1.40.0')
  })

  it('resolves a member importer version', () => {
    expect(parsePnpmLockfileVersion(lockfile, { packageName: PKG, importerRelPath: 'packages/a' }))
      .toBe('1.41.0')
  })

  it('returns undefined for an unknown importer', () => {
    expect(parsePnpmLockfileVersion(lockfile, { packageName: PKG, importerRelPath: 'packages/x' }))
      .toBeUndefined()
  })

  it('strips a v6/v9 peer-dependency suffix', () => {
    const withPeers = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@playwright/test':
        specifier: ^1.40.0
        version: 1.40.0(@types/node@20.0.0)(typescript@5.4.0)
`
    expect(parsePnpmLockfileVersion(withPeers, { packageName: PKG, importerRelPath: '.' }))
      .toBe('1.40.0')
  })

  it('handles the v5 scalar dependency form with an underscore peer suffix', () => {
    const v5 = `lockfileVersion: 5.4
importers:
  .:
    specifiers:
      '@playwright/test': ^1.40.0
    devDependencies:
      '@playwright/test': 1.40.0_react@16.14.0
`
    expect(parsePnpmLockfileVersion(v5, { packageName: PKG, importerRelPath: '.' }))
      .toBe('1.40.0')
  })
})

describe('parseBunLockfileVersion (bun.lock)', () => {
  // bun.lock is JSONC: object keys are unquoted-where-possible and trailing
  // commas are allowed. `packages` nested keys use the member's package name.
  const lockfile = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "root",
      "devDependencies": { "@playwright/test": "1.40.0", },
    },
    "packages/a": {
      "name": "pkg-a",
      "dependencies": { "@playwright/test": "1.41.0", },
    },
  },
  "packages": {
    "@playwright/test": ["@playwright/test@1.40.0", "", { "dependencies": { "playwright": "1.40.0" } }, "sha512-abc=="],
    "pkg-a/@playwright/test": ["@playwright/test@1.41.0", "", { "dependencies": { "playwright": "1.41.0" } }, "sha512-def=="],
  },
}
`

  it('resolves the hoisted version for the root importer', () => {
    expect(parseBunLockfileVersion(lockfile, { packageName: PKG, importerRelPath: '.' }))
      .toBe('1.40.0')
  })

  it('resolves a member-scoped version by package name', () => {
    expect(parseBunLockfileVersion(lockfile, { packageName: PKG, importerRelPath: 'packages/a' }))
      .toBe('1.41.0')
  })

  it('returns undefined when the package is absent', () => {
    expect(parseBunLockfileVersion(lockfile, { packageName: 'missing-pkg', importerRelPath: '.' }))
      .toBeUndefined()
  })
})

describe('parseYarnLockfileVersion (classic v1)', () => {
  const lockfile = `# THIS IS AN AUTOGENERATED FILE.
# yarn lockfile v1


"@playwright/test@1.41.0":
  version "1.41.0"
  resolved "https://registry.yarnpkg.com/@playwright/test/-/test-1.41.0.tgz#abc"

"@playwright/test@^1.40.0":
  version "1.60.0"
  resolved "https://registry.yarnpkg.com/@playwright/test/-/test-1.60.0.tgz#def"
`

  it('matches the exact declared range', () => {
    expect(parseYarnLockfileVersion(lockfile, { packageName: PKG, importerRelPath: 'packages/a', declaredRange: '1.41.0' }))
      .toBe('1.41.0')
  })

  it('resolves a caret range to its locked version', () => {
    expect(parseYarnLockfileVersion(lockfile, { packageName: PKG, importerRelPath: '.', declaredRange: '^1.40.0' }))
      .toBe('1.60.0')
  })

  it('handles a merged multi-descriptor header', () => {
    const merged = `# yarn lockfile v1

"@playwright/test@1.40.0", "@playwright/test@^1.40.0":
  version "1.40.0"
  resolved "https://registry.yarnpkg.com/@playwright/test/-/test-1.40.0.tgz#x"
`
    expect(parseYarnLockfileVersion(merged, { packageName: PKG, importerRelPath: '.', declaredRange: '^1.40.0' }))
      .toBe('1.40.0')
  })

  it('uses the sole resolution when no range is declared', () => {
    const single = `# yarn lockfile v1

"@playwright/test@^1.40.0":
  version "1.60.0"
  resolved "x"
`
    expect(parseYarnLockfileVersion(single, { packageName: PKG, importerRelPath: '.' }))
      .toBe('1.60.0')
  })
})

describe('parseYarnLockfileVersion (berry v2+)', () => {
  const lockfile = `# This file is generated by running "yarn install"
__metadata:
  version: 8
  cacheKey: 10c0

"@playwright/test@npm:1.41.0":
  version: 1.41.0
  resolution: "@playwright/test@npm:1.41.0"
  languageName: node
  linkType: hard

"@playwright/test@npm:^1.40.0":
  version: 1.60.0
  resolution: "@playwright/test@npm:1.60.0"
  languageName: node
  linkType: hard
`

  it('matches the exact declared range (npm protocol stripped)', () => {
    expect(parseYarnLockfileVersion(lockfile, { packageName: PKG, importerRelPath: 'packages/a', declaredRange: '1.41.0' }))
      .toBe('1.41.0')
  })

  it('resolves a caret range to its locked version', () => {
    expect(parseYarnLockfileVersion(lockfile, { packageName: PKG, importerRelPath: '.', declaredRange: '^1.40.0' }))
      .toBe('1.60.0')
  })

  it('returns undefined when ambiguous and no range is declared', () => {
    expect(parseYarnLockfileVersion(lockfile, { packageName: PKG, importerRelPath: '.' }))
      .toBeUndefined()
  })
})
