import { describe, it, expect } from 'vitest'

import { filterTarballsByLockfile } from '../lockfile-filter.js'

const PNPM_LOCKFILE = `
lockfileVersion: '9.0'
packages:
  '@acme/kept@1.2.3':
    resolution: {integrity: sha512-aaa}
  other@2.0.0:
    resolution: {integrity: sha512-bbb}
`

const NPM_LOCKFILE = JSON.stringify({
  lockfileVersion: 3,
  packages: {
    '': { name: 'root' },
    'node_modules/@acme/kept': {
      version: '1.2.3',
      resolved: 'https://registry.npmjs.org/@acme/kept/-/kept-1.2.3.tgz',
      integrity: 'sha512-aaa',
    },
  },
})

// Trailing comma included: bun.lock is JSONC and the filter must accept
// bun's own serialization.
const BUN_LOCKFILE = `{
  "lockfileVersion": 1,
  "packages": {
    "@acme/kept": ["@acme/kept@1.2.3", "", {}, "sha512-aaa"],
  },
}`

describe('filterTarballsByLockfile()', () => {
  const kept = {
    name: '@acme/kept',
    version: '1.2.3',
    integrity: 'sha512-aaa',
    archiveFilename: '@acme+kept@1.2.3.tgz',
  }
  const dropped = {
    name: '@acme/dropped',
    version: '4.5.6',
    integrity: 'sha512-bbb',
    archiveFilename: '@acme+dropped@4.5.6.tgz',
  }

  it('splits tarballs by name@version presence in a pnpm lockfile', () => {
    const result = filterTarballsByLockfile([kept, dropped], PNPM_LOCKFILE, 'pnpm-lock.yaml')
    expect(result.kept).toEqual([kept])
    expect(result.dropped).toEqual([dropped])
  })

  it('splits tarballs by name@version presence in an npm lockfile', () => {
    const result = filterTarballsByLockfile([kept, dropped], NPM_LOCKFILE, 'package-lock.json')
    expect(result.kept).toEqual([kept])
    expect(result.dropped).toEqual([dropped])
  })

  it('splits tarballs by name@version presence in a bun lockfile', () => {
    const result = filterTarballsByLockfile([kept, dropped], BUN_LOCKFILE, 'bun.lock')
    expect(result.kept).toEqual([kept])
    expect(result.dropped).toEqual([dropped])
  })

  it('drops a tarball whose name matches but whose version does not', () => {
    const otherVersion = {
      name: '@acme/kept',
      version: '9.9.9',
      integrity: 'sha512-ccc',
      archiveFilename: '@acme+kept@9.9.9.tgz',
    }
    const result = filterTarballsByLockfile([otherVersion], PNPM_LOCKFILE, 'pnpm-lock.yaml')
    expect(result.kept).toEqual([])
    expect(result.dropped).toEqual([otherVersion])
  })

  it('can drop every tarball', () => {
    const result = filterTarballsByLockfile([dropped], PNPM_LOCKFILE, 'pnpm-lock.yaml')
    expect(result.kept).toEqual([])
    expect(result.dropped).toEqual([dropped])
  })

  it('keeps every tarball when the lockfile cannot be parsed', () => {
    // An unparseable lockfile means the filter cannot know what survived;
    // shipping the pre-filter superset is the safe previous behavior.
    const result = filterTarballsByLockfile([kept, dropped], 'lockfileVersion: unknown\n', 'pnpm-lock.yaml')
    expect(result.kept).toEqual([kept, dropped])
    expect(result.dropped).toEqual([])
  })

  it('keeps every tarball for an unsupported lockfile name', () => {
    const result = filterTarballsByLockfile([kept], 'anything', 'yarn.lock')
    expect(result.kept).toEqual([kept])
    expect(result.dropped).toEqual([])
  })
})
