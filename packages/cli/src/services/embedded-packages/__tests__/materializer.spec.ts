import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { AddressInfo } from 'node:net'

import Debug from 'debug'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { EmbeddedPackageError, EmbeddedPackagesMaterializer } from '../materializer.js'

const fooTarball = Buffer.from('fake tarball content for @acme/foo')
const fooIntegrity = `sha512-${createHash('sha512').update(fooTarball).digest('base64')}`
const barTarball = Buffer.from('fake tarball content for bar')
const barIntegrity = `sha512-${createHash('sha512').update(barTarball).digest('base64')}`

function lockfileContent (): string {
  return `
lockfileVersion: '9.0'
packages:
  '@acme/foo@1.2.3':
    resolution: {integrity: ${fooIntegrity}}
  bar@2.0.0:
    resolution: {integrity: ${barIntegrity}}
  bar@3.0.0:
    resolution: {integrity: ${barIntegrity}}
  'git-dep@https://codeload.github.com/user/git-dep/tar.gz/abc123':
    resolution: {tarball: https://codeload.github.com/user/git-dep/tar.gz/abc123}
`
}

async function captureStderr (fn: () => Promise<void>): Promise<string[]> {
  const written: string[] = []
  const original = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((chunk: string) => {
    written.push(String(chunk))
    return true
  }) as never
  try {
    await fn()
  } finally {
    process.stderr.write = original
  }
  return written
}

// The lead-in of the warning a configuration gets when it selects no
// packages at all.
const NOTHING_MATCHED = `No packages matched 'bundle.packages.embed'`

describe('EmbeddedPackagesMaterializer', () => {
  let workspaceRoot: string
  let homedir: string
  let cacheDir: string
  let lockfilePath: string
  let server: http.Server
  let serverUrl: string
  let requests: Array<{ url: string, authorization?: string, acceptEncoding?: string }>

  const makeMaterializer = (specs: string[], overrides: Record<string, unknown> = {}) => {
    return new EmbeddedPackagesMaterializer({
      specs,
      lockfilePath,
      workspaceRoot,
      env: { CHECKLY_CACHE_DIR: cacheDir },
      homedir,
      ...overrides,
    })
  }

  // Materializes the full plan, the way the Bundler does at finalize time
  // (production passes the subset the pruned lockfile still references).
  const materializeAll = async (materializer: EmbeddedPackagesMaterializer) => {
    return materializer.materializeTarballs((await materializer.plan()).tarballs)
  }

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-embed-ws-'))
    homedir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-embed-home-'))
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-embed-cache-'))
    lockfilePath = path.join(workspaceRoot, 'pnpm-lock.yaml')
    await fs.writeFile(lockfilePath, lockfileContent())

    requests = []
    server = http.createServer((req, res) => {
      requests.push({
        url: req.url!,
        authorization: req.headers.authorization,
        acceptEncoding: req.headers['accept-encoding'] as string | undefined,
      })
      if (req.url === '/@acme/foo/-/foo-1.2.3.tgz') {
        res.end(fooTarball)
      } else if (req.url === '/bar/-/bar-2.0.0.tgz') {
        res.end(barTarball)
      } else if (req.url === '/bar/-/bar-3.0.0.tgz') {
        res.end(barTarball)
      } else if (req.url === '/secured/-/secured-1.0.0.tgz' && req.headers.authorization !== 'Bearer secret') {
        res.statusCode = 401
        res.end('unauthorized')
      } else {
        res.statusCode = 404
        res.end('not found')
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { address, port } = server.address() as AddressInfo
    serverUrl = `http://${address}:${port}/`
    await fs.writeFile(path.join(workspaceRoot, '.npmrc'), `registry=${serverUrl}\n`)
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    for (const dir of [workspaceRoot, homedir, cacheDir]) {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  describe('plan()', () => {
    it('resolves a bare name to every lockfile version', async () => {
      const { tarballs, issues } = await makeMaterializer(['bar']).plan()
      expect(issues).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['bar@2.0.0.tgz', 'bar@3.0.0.tgz'])
    })

    it('resolves a name@version pin to that version only', async () => {
      const { tarballs, issues } = await makeMaterializer(['bar@2.0.0']).plan()
      expect(issues).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['bar@2.0.0.tgz'])
    })

    it('deduplicates overlapping specs', async () => {
      const { tarballs } = await makeMaterializer(['bar', 'bar@2.0.0']).plan()
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['bar@2.0.0.tgz', 'bar@3.0.0.tgz'])
    })

    it('resolves a scope wildcard to every matching package and version', async () => {
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  '@acme/foo@1.2.3':
    resolution: {integrity: ${fooIntegrity}}
  '@acme/foo-utils@2.0.0':
    resolution: {integrity: ${barIntegrity}}
  '@other/pkg@1.0.0':
    resolution: {integrity: ${barIntegrity}}
  bar@2.0.0:
    resolution: {integrity: ${barIntegrity}}
`)
      const { tarballs, issues } = await makeMaterializer(['@acme/*']).plan()
      expect(issues).toEqual([])
      expect(tarballs.map(t => t.archiveFilename).sort()).toEqual([
        '@acme+foo-utils@2.0.0.tgz',
        '@acme+foo@1.2.3.tgz',
      ])
    })

    it('resolves prefix and suffix wildcards against unscoped names only', async () => {
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  acme-utils@1.0.0:
    resolution: {integrity: ${barIntegrity}}
  acme-core@1.0.0:
    resolution: {integrity: ${barIntegrity}}
  '@acme/acme-extra@1.0.0':
    resolution: {integrity: ${barIntegrity}}
`)
      const { tarballs, issues } = await makeMaterializer(['acme-*']).plan()
      expect(issues).toEqual([])
      // The wildcard does not cross the scope separator, so the scoped
      // package stays out even though its name part matches.
      expect(tarballs.map(t => t.archiveFilename).sort()).toEqual([
        'acme-core@1.0.0.tgz',
        'acme-utils@1.0.0.tgz',
      ])
    })

    it('filters wildcard matches by an exact version pin', async () => {
      const { tarballs, issues } = await makeMaterializer(['ba*@2.0.0']).plan()
      expect(issues).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['bar@2.0.0.tgz'])
    })

    it('reports a wildcard that matches nothing in the lockfile', async () => {
      const { issues } = await makeMaterializer(['@nomatch/*']).plan()
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('spec-not-found')
      expect(issues[0].message).toContain('pattern matches')
    })

    it('reports a wildcard that only matches workspace packages', async () => {
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@acme/shared':
        specifier: workspace:*
        version: link:packages/shared
packages: {}
`)
      const { issues } = await makeMaterializer(['@acme/*']).plan()
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('spec-not-embeddable')
      expect(issues[0].message).toContain('workspace package')
    })

    it('silently skips workspace packages a wildcard also matches', async () => {
      // The monorepo case: the scope holds both registry packages and
      // workspace members. The wildcard embeds the former and skips the
      // latter without erroring.
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@acme/shared':
        specifier: workspace:*
        version: link:packages/shared
packages:
  '@acme/foo@1.2.3':
    resolution: {integrity: ${fooIntegrity}}
`)
      const { tarballs, issues } = await makeMaterializer(['@acme/*']).plan()
      expect(issues).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['@acme+foo@1.2.3.tgz'])
    })

    it('reports unfetchable wildcard matches as plan warnings without writing to stderr', async () => {
      // A bare * matches bar (registry, both versions) and git-dep (a git
      // dependency the CLI cannot embed): the registry matches embed and
      // the git dependency surfaces as a plan warning naming it. The
      // wildcard's selection itself is debug-logged only — materializing
      // writes nothing to stderr that would interrupt styled command
      // output.
      const materializer = makeMaterializer(['*'])
      const { tarballs, issues, warnings } = await materializer.plan()
      expect(issues).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['bar@2.0.0.tgz', 'bar@3.0.0.tgz'])
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('git-dep')
      expect(warnings[0]).toContain('cannot be embedded')
      const written = await captureStderr(async () => {
        await materializeAll(materializer)
      })
      // Filtered rather than asserting total silence: the debug package
      // also writes to stderr when DEBUG is enabled.
      expect(written.filter(line => line.includes('Embedded package'))).toEqual([])
    })

    it('debug-logs what a wildcard selected during planning', async () => {
      // The wildcard selection has no user-facing output; the debug channel
      // is the only place it is visible, so pin that it actually fires —
      // and fires during plan(), covering validate-only and failing runs.
      const previouslyEnabled = Debug.disable()
      Debug.enable('checkly:cli:services:embedded-packages')
      try {
        const written = await captureStderr(async () => {
          await makeMaterializer(['*']).plan()
        })
        expect(written.join('')).toContain('pattern * matched 2 package(s)')
      } finally {
        Debug.enable(previouslyEnabled)
      }
    })

    it('does not warn about unfetchable matches a version pin already excludes', async () => {
      const npmLockfilePath = path.join(workspaceRoot, 'package-lock.json')
      await fs.writeFile(npmLockfilePath, JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/@acme/foo': {
            version: '1.2.3',
            resolved: 'https://registry.npmjs.org/@acme/foo/-/foo-1.2.3.tgz',
            integrity: fooIntegrity,
          },
          'node_modules/@acme/legacy': {
            version: '2.0.0',
            resolved: 'git+ssh://git@github.com/acme/legacy.git#abc123',
          },
        },
      }))
      const { warnings, issues } = await makeMaterializer(['@acme/*@1.2.3'], { lockfilePath: npmLockfilePath }).plan()
      expect(issues).toEqual([])
      // @acme/legacy@2.0.0 was excluded by the pin, not by embeddability —
      // warning about it would send the user chasing a non-issue.
      expect(warnings).toEqual([])
    })

    it('does not warn about integrity-less duplicates of embedded registry entries', async () => {
      // npm nests integrity-less bundled copies of packages that also
      // exist as proper registry entries; the artifact IS embedded, so
      // the duplicate must not surface as a skipped unfetchable match.
      const npmLockfilePath = path.join(workspaceRoot, 'package-lock.json')
      await fs.writeFile(npmLockfilePath, JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/dup': {
            version: '1.0.0',
            resolved: 'https://registry.npmjs.org/dup/-/dup-1.0.0.tgz',
            integrity: barIntegrity,
          },
          'node_modules/a/node_modules/dup': { version: '1.0.0', inBundle: true },
        },
      }))
      const { tarballs, warnings, issues } = await makeMaterializer(['du*'], { lockfilePath: npmLockfilePath }).plan()
      expect(issues).toEqual([])
      expect(warnings).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['dup@1.0.0.tgz'])
    })

    it('prefers the actionable excluded reason over version blame for an exact pinned spec', async () => {
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  foo@2.0.0:
    resolution: {integrity: ${barIntegrity}}
  foo@1.0.0:
    resolution: {}
`)
      const { issues } = await makeMaterializer(['foo@1.0.0']).plan()
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('spec-not-embeddable')
      expect(issues[0].message).toContain('integrity')
    })

    it('stays silent on stderr for plain specs', async () => {
      const materializer = makeMaterializer(['bar@2.0.0'])
      const written = await captureStderr(async () => {
        const { warnings } = await materializer.plan()
        expect(warnings).toEqual([])
        await materializeAll(materializer)
      })
      // Filtered rather than asserting total silence: the debug package
      // also writes to stderr when DEBUG is enabled.
      expect(written.filter(line => line.includes('Embedded package'))).toEqual([])
    })

    it('blames the version pin when a wildcard matches names but no version', async () => {
      // The workspace link sharing the scope must not be blamed: the
      // pattern matched registry names, the pin filtered them out.
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@acme/shared':
        specifier: workspace:*
        version: link:packages/shared
packages:
  '@acme/foo@1.2.3':
    resolution: {integrity: ${fooIntegrity}}
`)
      const { issues } = await makeMaterializer(['@acme/*@9.9.9']).plan()
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('spec-version-not-found')
      expect(issues[0].message).toContain('9.9.9')
      expect(issues[0].message).not.toContain('workspace')
    })

    it('drops what a later ! entry excludes', async () => {
      const { tarballs, issues, warnings } = await makeMaterializer(['@acme/*', 'bar', '!bar']).plan()
      expect(issues).toEqual([])
      expect(warnings).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['@acme+foo@1.2.3.tgz'])
    })

    it('applies entries in order, so an exclusion before an inclusion removes nothing', async () => {
      const { tarballs, issues } = await makeMaterializer(['!bar', 'bar']).plan()
      expect(issues).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['bar@2.0.0.tgz', 'bar@3.0.0.tgz'])
    })

    it('excludes only the pinned version when the ! entry carries one', async () => {
      const { tarballs, issues } = await makeMaterializer(['bar', '!bar@2.0.0']).plan()
      expect(issues).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['bar@3.0.0.tgz'])
    })

    it('treats an exclusion that removes nothing as a no-op, not an error', async () => {
      const { tarballs, issues } = await makeMaterializer(['bar', '!@nomatch/*']).plan()
      expect(issues).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['bar@2.0.0.tgz', 'bar@3.0.0.tgz'])
    })

    it('reports nothing for an entry whose every match a later ! entry removed', async () => {
      // The entry resolved fine; the configuration then asked for its
      // matches back out. That is not the unresolvable-spec error an entry
      // matching nothing in the first place would get.
      const { tarballs, issues, warnings } = await makeMaterializer(['bar', '!bar']).plan()
      expect(issues).toEqual([])
      expect(tarballs).toEqual([])
      expect(warnings).toEqual([expect.stringContaining(NOTHING_MATCHED)])
    })

    it('silently cancels a pinned entry that a later ! entry pins away', async () => {
      // Appending '!name@version' is the natural way to switch one embed
      // off. Matching at name level would leave the entry alive on bar's
      // other versions and fail with a version-not-found error naming 3.0.0
      // as all the lockfile has, while 2.0.0 is right there.
      const { tarballs, issues, warnings } = await makeMaterializer(['bar@2.0.0', '!bar@2.0.0']).plan()
      expect(issues).toEqual([])
      expect(tarballs).toEqual([])
      expect(warnings).toEqual([expect.stringContaining(NOTHING_MATCHED)])
    })

    it('still reports a pin that matches nothing even when a ! entry removes the other versions', async () => {
      // The exclusions are not what left this entry empty, so the typo in
      // the pin must not be swallowed along with them.
      const { issues } = await makeMaterializer(['bar@9.9.9', '!bar']).plan()
      expect(issues).toHaveLength(1)
      expect(issues[0].spec).toBe('bar@9.9.9')
      // The pin is what is wrong, not the install: the message must still
      // name the versions the lockfile does have.
      expect(issues[0].type).toBe('spec-version-not-found')
      expect(issues[0].message).toContain('lockfile has: 2.0.0, 3.0.0')
    })

    it('still reports a mistyped pin when a ! entry only removes version-less matches of that name', async () => {
      // A git resolution is recorded with no version, so it matches any pin.
      // If it could satisfy the emptied-entry guard, the '!bar' entry would
      // silence 'bar@9.9.9' — a stale pin would then drop out of the bundle
      // with no error at all, and the install would fail on the runner.
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  bar@2.0.0:
    resolution: {integrity: ${barIntegrity}}
  'bar@https://codeload.github.com/user/bar/tar.gz/abc123':
    resolution: {tarball: https://codeload.github.com/user/bar/tar.gz/abc123}
  keep@1.0.0:
    resolution: {integrity: ${barIntegrity}}
`)
      const { tarballs, issues } = await makeMaterializer(['keep', 'bar@9.9.9', '!bar']).plan()
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['keep@1.0.0.tgz'])
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('spec-version-not-found')
      expect(issues[0].spec).toBe('bar@9.9.9')
    })

    it('keeps the accurate not-embeddable reason for a pinned entry a ! entry also matches', async () => {
      // A git resolution has no version, so it cannot satisfy the pin and the
      // entry has to fail either way. It must fail saying the package cannot
      // be embedded, not that the lockfile has never heard of it.
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  'git-dep@https://codeload.github.com/user/git-dep/tar.gz/abc123':
    resolution: {tarball: https://codeload.github.com/user/git-dep/tar.gz/abc123}
  bar@2.0.0:
    resolution: {integrity: ${barIntegrity}}
`)
      const { issues } = await makeMaterializer(['git-dep@1.0.0', '!git-dep']).plan()
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('spec-not-embeddable')
      expect(issues[0].message).toContain('git, file or URL dependency')
    })

    it('does not turn surviving unfetchable matches into an error when the registry matches were excluded', async () => {
      // A bare * reaches bar (registry) and git-dep (unfetchable). Excluding
      // bar leaves only git-dep, which must not promote the entry into a
      // fatal 'cannot be embedded' — that reason applies to an entry with
      // nothing else to embed, not to one deliberately emptied.
      const { tarballs, issues, warnings } = await makeMaterializer(['*', '!bar']).plan()
      expect(issues).toEqual([])
      expect(tarballs).toEqual([])
      // Only the nothing-embedded notice; no 'cannot be embedded' error.
      expect(warnings).toEqual([expect.stringContaining(NOTHING_MATCHED)])
    })

    it('silences the unfetchable warning for a package a later ! entry excludes', async () => {
      const { tarballs, issues, warnings } = await makeMaterializer(['*', '!git-dep']).plan()
      expect(issues).toEqual([])
      expect(warnings).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['bar@2.0.0.tgz', 'bar@3.0.0.tgz'])
    })

    it('lets a ! entry resolve a wildcard whose only match cannot be embedded', async () => {
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  '@acme/legacy@https://codeload.github.com/user/legacy/tar.gz/abc123':
    resolution: {tarball: https://codeload.github.com/user/legacy/tar.gz/abc123}
  bar@2.0.0:
    resolution: {integrity: ${barIntegrity}}
`)
      // Without the exclusion this is a fatal spec-not-embeddable, since
      // the scope's only entry is a git dependency.
      const { tarballs, issues, warnings } = await makeMaterializer(['@acme/*', '!@acme/legacy']).plan()
      expect(issues).toEqual([])
      expect(tarballs).toEqual([])
      expect(warnings).toEqual([expect.stringContaining(NOTHING_MATCHED)])
    })

    it('warns when the configuration selects nothing at all', async () => {
      // `!` subtracts from what came before, so a list of nothing but
      // exclusions is not gitignore's "everything except" — it is empty.
      const { tarballs, issues, warnings } = await makeMaterializer(['!@acme/foo']).plan()
      expect(issues).toEqual([])
      expect(tarballs).toEqual([])
      expect(warnings).toEqual([expect.stringContaining(NOTHING_MATCHED)])
    })

    it('converts scope slashes for the archive filename', async () => {
      const { tarballs } = await makeMaterializer(['@acme/foo']).plan()
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['@acme+foo@1.2.3.tgz'])
    })

    it('reports a spec that matches nothing in the lockfile', async () => {
      const { issues } = await makeMaterializer(['no-such-package']).plan()
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('spec-not-found')
      expect(issues[0].message).toContain('no-such-package')
    })

    it('reports a version pin that matches nothing in the lockfile, naming the available versions', async () => {
      const { issues } = await makeMaterializer(['bar@9.9.9']).plan()
      expect(issues[0].type).toBe('spec-version-not-found')
      expect(issues[0].message).toContain('none of them at version 9.9.9')
      expect(issues[0].detail).toContain('lockfile has: ')
    })

    it('reports a spec that only matches a git dependency', async () => {
      const { issues } = await makeMaterializer(['git-dep']).plan()
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('spec-not-embeddable')
      expect(issues[0].message).toContain('git, file or URL dependency')
    })

    it('reports an invalid spec as an issue', async () => {
      const { issues } = await makeMaterializer(['Not A Valid Name']).plan()
      expect(issues[0].type).toBe('invalid-spec')
      expect(issues[0].message).toContain('not a valid npm package name')
    })

    it('reports a workspace package with a precise reason', async () => {
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@acme/shared':
        specifier: workspace:*
        version: link:packages/shared
packages: {}
`)
      const { issues } = await makeMaterializer(['@acme/shared']).plan()
      expect(issues[0].type).toBe('spec-not-embeddable')
      expect(issues[0].message).toContain('workspace package')
    })

    it('reports a missing lockfile', async () => {
      const materializer = makeMaterializer(['bar'], { lockfilePath: undefined })
      const { issues } = await materializer.plan()
      expect(issues[0].type).toBe('missing-lockfile')
    })

    it('reports an unsupported lockfile', async () => {
      const yarnLockfilePath = path.join(workspaceRoot, 'yarn.lock')
      await fs.writeFile(yarnLockfilePath, '')
      const { issues } = await makeMaterializer(['bar'], { lockfilePath: yarnLockfilePath }).plan()
      expect(issues[0].type).toBe('unsupported-lockfile')
      expect(issues[0].message).toContain('yarn.lock')
    })

    it('reports an unparseable lockfile as an issue instead of throwing', async () => {
      await fs.writeFile(lockfilePath, [
        'lockfileVersion:',
        '<<<<<<< HEAD',
        `  '9.0'`,
        '=======',
        `  '6.0'`,
        '>>>>>>> other-branch',
      ].join('\n'))
      const { issues } = await makeMaterializer(['bar']).plan()
      expect(issues[0].type).toBe('unsupported-lockfile')
      expect(issues[0].message).toContain('Failed to read or parse the lockfile')
      expect(issues[0].message).toContain(lockfilePath)
    })
  })

  describe('materializeTarballs()', () => {
    it('materializes only the requested subset of the plan', async () => {
      const materializer = makeMaterializer(['@acme/foo', 'bar@2.0.0'])
      const { tarballs } = await materializer.plan()
      const barOnly = tarballs.filter(tarball => tarball.name === 'bar')
      const materialized = await materializer.materializeTarballs(barOnly)
      expect(materialized.map(t => t.archivePath)).toEqual([
        '.checkly/embedded-packages/bar@2.0.0.tgz',
      ])
      // The unrequested tarball must produce no registry traffic at all.
      expect(requests.map(r => r.url)).toEqual(['/bar/-/bar-2.0.0.tgz'])
    })

    it('returns nothing for an empty subset without touching the registry', async () => {
      const materialized = await makeMaterializer(['bar@2.0.0']).materializeTarballs([])
      expect(materialized).toEqual([])
      expect(requests).toHaveLength(0)
    })

    it('refuses even an empty subset when the plan has issues', async () => {
      // The issues backstop is checked before the empty-list short-circuit:
      // an invalid configuration must not pass silently just because
      // nothing was requested.
      const materializer = makeMaterializer(['no-such-package'])
      await expect(materializer.materializeTarballs([])).rejects.toThrow(EmbeddedPackageError)
    })
  })

  describe('materializeTarballs() over the full plan', () => {
    it('downloads tarballs from the registry and verifies them', async () => {
      const tarballs = await materializeAll(makeMaterializer(['@acme/foo', 'bar@2.0.0']))
      expect(tarballs.map(t => t.archivePath)).toEqual([
        '.checkly/embedded-packages/@acme+foo@1.2.3.tgz',
        '.checkly/embedded-packages/bar@2.0.0.tgz',
      ])
      await expect(fs.readFile(tarballs[0].filePath)).resolves.toEqual(fooTarball)
      expect(requests.map(r => r.url).sort()).toEqual([
        '/@acme/foo/-/foo-1.2.3.tgz',
        '/bar/-/bar-2.0.0.tgz',
      ])
      // The raw artifact must be requested: a gzip-labelled response would
      // be transparently decompressed and fail integrity verification.
      expect(requests.every(r => r.acceptEncoding === 'identity')).toBe(true)
    })

    it('defaults the cache to node_modules/.cache/checkly under the workspace root', async () => {
      const tarballs = await materializeAll(makeMaterializer(['bar@2.0.0'], { env: {} }))
      expect(tarballs[0].filePath.startsWith(
        path.join(workspaceRoot, 'node_modules', '.cache', 'checkly', 'embedded-packages'),
      )).toBe(true)
    })

    it('derives the project root from the lockfile path when no workspace root is given', async () => {
      const tarballs = await materializeAll(makeMaterializer(['bar@2.0.0'], { env: {}, workspaceRoot: undefined }))
      expect(tarballs[0].filePath.startsWith(path.join(
        path.dirname(lockfilePath), 'node_modules', '.cache', 'checkly', 'embedded-packages',
      ))).toBe(true)
    })

    it('reuses the CLI cache instead of downloading again', async () => {
      await materializeAll(makeMaterializer(['bar@2.0.0']))
      expect(requests).toHaveLength(1)
      await materializeAll(makeMaterializer(['bar@2.0.0']))
      expect(requests).toHaveLength(1)
    })

    it('uses npm cacache content without hitting the network', async () => {
      const npmCacheDir = path.join(homedir, '.npm')
      const hex = createHash('sha512').update(barTarball).digest('hex')
      const contentPath = path.join(
        npmCacheDir, '_cacache', 'content-v2', 'sha512',
        hex.slice(0, 2), hex.slice(2, 4), hex.slice(4),
      )
      await fs.mkdir(path.dirname(contentPath), { recursive: true })
      await fs.writeFile(contentPath, barTarball)

      // Pin the npm cache location: the platform default differs (~/.npm on
      // POSIX, %LOCALAPPDATA%\npm-cache on Windows) and the production code
      // uses the real process.platform.
      const materializer = makeMaterializer(['bar@2.0.0'], {
        env: { CHECKLY_CACHE_DIR: cacheDir, npm_config_cache: npmCacheDir },
      })
      const tarballs = await materializeAll(materializer)
      expect(requests).toHaveLength(0)
      await expect(fs.readFile(tarballs[0].filePath)).resolves.toEqual(barTarball)
    })

    it('sends npmrc credentials for the registry', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        `registry=${serverUrl}`,
        `//127.0.0.1:${(server.address() as AddressInfo).port}/:_authToken=secret`,
      ].join('\n'))

      await materializeAll(makeMaterializer(['bar@2.0.0']))
      expect(requests[0].authorization).toBe('Bearer secret')
    })

    it('sends a scope-qualified credential for a package in that scope', async () => {
      // The key `pnpm login --scope=@acme` writes. It only resolves if the
      // package being downloaded reaches the credential lookup.
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        `registry=${serverUrl}`,
        `//127.0.0.1:${(server.address() as AddressInfo).port}/:@acme:_authToken=scoped-secret`,
      ].join('\n'))

      await materializeAll(makeMaterializer(['@acme/foo']))
      expect(requests[0].authorization).toBe('Bearer scoped-secret')
    })

    // Both cases deliberately put a *different* token in each file: with a
    // token in only one of them, either ordering resolves the same
    // credential and the test could not detect inverted precedence.
    // XDG_CONFIG_HOME pins pnpm's config dir on every platform, so neither
    // test has to branch on the real process.platform.
    const writeCompetingTokens = async () => {
      const nerfDart = `//127.0.0.1:${(server.address() as AddressInfo).port}/`
      await fs.mkdir(path.join(homedir, 'pnpm'), { recursive: true })
      await fs.writeFile(path.join(homedir, 'pnpm', 'auth.ini'), `${nerfDart}:_authToken=pnpm-token\n`)
      await fs.writeFile(path.join(homedir, '.npmrc'), `${nerfDart}:_authToken=npmrc-token\n`)
      return { CHECKLY_CACHE_DIR: cacheDir, XDG_CONFIG_HOME: homedir }
    }

    it('prefers the pnpm auth file over the user .npmrc for a pnpm lockfile', async () => {
      const env = await writeCompetingTokens()

      await materializeAll(makeMaterializer(['bar@2.0.0'], { env }))
      expect(requests[0].authorization).toBe('Bearer pnpm-token')
    })

    it('prefers the user .npmrc over the pnpm auth file for an npm lockfile', async () => {
      const env = await writeCompetingTokens()

      // No `resolved` field: npm lockfiles normally carry one, and it would
      // be used verbatim, sending the request to the real registry instead
      // of this test's server.
      const npmLockfilePath = path.join(workspaceRoot, 'package-lock.json')
      await fs.writeFile(npmLockfilePath, JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/bar': { version: '2.0.0', integrity: barIntegrity },
        },
      }))

      await materializeAll(makeMaterializer(['bar@2.0.0'], { lockfilePath: npmLockfilePath, env }))
      expect(requests[0].authorization).toBe('Bearer npmrc-token')
    })

    it('prefers a lockfile-recorded tarball URL over the derived one', async () => {
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  bar@2.0.0:
    resolution: {integrity: ${barIntegrity}, tarball: ${serverUrl}custom/path/bar-2.0.0.tgz}
`)
      server.removeAllListeners('request')
      server.on('request', (req, res) => {
        requests.push({ url: req.url!, authorization: req.headers.authorization })
        res.end(barTarball)
      })

      await materializeAll(makeMaterializer(['bar@2.0.0']))
      expect(requests[0].url).toBe('/custom/path/bar-2.0.0.tgz')
    })

    it('blames the lockfile, not the registry config, for an unusable recorded URL', async () => {
      // The advice has to match the source: sending someone to fix a
      // registry setting that is already correct wastes the whole message.
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  bar@2.0.0:
    resolution: {integrity: ${barIntegrity}, tarball: 'https://'}
`)

      const error = await materializeAll(makeMaterializer(['bar@2.0.0'])).catch(err => err)
      expect(error.message).toMatch(/tarball URL.*is not a valid URL/s)
      expect(error.message).toContain(`recorded in '${lockfilePath}'`)
      expect(error.message).not.toContain('registry')
      expect(requests).toHaveLength(0)
    })

    it('fails with a clear error on an integrity mismatch', async () => {
      server.removeAllListeners('request')
      server.on('request', (req, res) => res.end('tampered content'))

      await expect(materializeAll(makeMaterializer(['bar@2.0.0'])))
        .rejects.toThrow(/does not match the integrity hash recorded in the lockfile/)
    })

    it('fails with a clear error on a download failure', async () => {
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  secured@1.0.0:
    resolution: {integrity: ${barIntegrity}}
`)
      await expect(materializeAll(makeMaterializer(['secured'])))
        .rejects.toThrow(/Failed to download embedded package 'secured@1\.0\.0'.*HTTP 401.*credentials/s)
    })

    describe('authentication hints', () => {
      const securedLockfile = `
lockfileVersion: '9.0'
packages:
  secured@1.0.0:
    resolution: {integrity: ${barIntegrity}}
`

      it('names every consulted config file when no credentials matched', async () => {
        await fs.writeFile(lockfilePath, securedLockfile)

        // XDG_CONFIG_HOME pins auth.ini's location: the production code
        // uses the real process.platform, whose default differs per OS.
        const error = await materializeAll(makeMaterializer(['secured'], {
          env: { CHECKLY_CACHE_DIR: cacheDir, XDG_CONFIG_HOME: homedir },
        })).catch(err => err)
        expect(error.message).toMatch(/No credentials for this registry were found in/)
        expect(error.message).toContain(path.join(workspaceRoot, '.npmrc'))
        expect(error.message).toContain(path.join(homedir, '.npmrc'))
        // pnpm's auth.ini is named alongside the .npmrc files, so a pnpm
        // user is not told to edit a file their credentials do not live in.
        expect(error.message).toContain(path.join(homedir, 'pnpm', 'auth.ini'))
      })

      it('names the file a rejected credential came from', async () => {
        await fs.writeFile(lockfilePath, securedLockfile)
        const workspaceNpmrc = path.join(workspaceRoot, '.npmrc')
        const nerfDart = `//127.0.0.1:${(server.address() as AddressInfo).port}/`
        await fs.writeFile(workspaceNpmrc, [
          `registry=${serverUrl}`,
          `${nerfDart}:_authToken=wrong-token`,
        ].join('\n'))

        const error = await materializeAll(makeMaterializer(['secured'])).catch(err => err)
        expect(error.message).toMatch(/credentials sent for this registry were rejected/)
        expect(error.message).toMatch(/expired token/)
        // Naming the exact key and file is the whole point: several files
        // can supply a credential, and "yours was rejected" without saying
        // which one leaves the reader as stuck as a bare status code.
        expect(error.message).toContain(`'${nerfDart}:_authToken' in '${workspaceNpmrc}'`)
        // Never the credential itself.
        expect(error.message).not.toContain('wrong-token')
      })

      it('names the environment variable when the credential came from one', async () => {
        await fs.writeFile(lockfilePath, securedLockfile)
        const { port } = server.address() as AddressInfo
        const envKey = `npm_config_//127.0.0.1:${port}/:_authToken`

        const error = await materializeAll(makeMaterializer(['secured'], {
          env: { CHECKLY_CACHE_DIR: cacheDir, [envKey]: 'env-token' },
        })).catch(err => err)
        // The stored key has the npm_config_ prefix stripped, so the hint
        // must name the variable itself or it names nothing searchable.
        expect(error.message).toContain(`the '${envKey}' environment variable`)
        expect(error.message).not.toContain('env-token')
      })

      it('names an uppercase environment variable by its real spelling', async () => {
        await fs.writeFile(lockfilePath, securedLockfile)
        // Shells and CI systems routinely uppercase these. The config map
        // case-folds the key, so echoing the key would print a name that
        // does not exist in the environment.
        const envKey = 'NPM_CONFIG_REGISTRY'

        const error = await materializeAll(makeMaterializer(['secured'], {
          env: { CHECKLY_CACHE_DIR: cacheDir, [envKey]: `http://user:pass@127.0.0.1:${
            (server.address() as AddressInfo).port}/` },
        })).catch(err => err)
        expect(error.message).toContain(`the '${envKey}' environment variable`)
        expect(error.message).not.toContain('npm_config_registry')
        expect(error.message).not.toContain('pass@')
      })

      it('attributes credentials in a lockfile-recorded URL to the lockfile', async () => {
        const { port } = server.address() as AddressInfo
        // npm lockfiles record a `resolved` URL verbatim, and it can carry
        // userinfo — in which case no config key is to blame for it.
        await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  secured@1.0.0:
    resolution: {integrity: ${barIntegrity}, tarball: http://user:pass@127.0.0.1:${port}/secured/-/secured-1.0.0.tgz}
`)

        const error = await materializeAll(makeMaterializer(['secured'])).catch(err => err)
        expect(error.message).toContain(`came from the tarball URL recorded in '${lockfilePath}'`)
        expect(error.message).not.toContain('pass@')
      })

      it('blames a cross-host redirect rather than the credentials', async () => {
        await fs.writeFile(lockfilePath, securedLockfile)
        const { port } = server.address() as AddressInfo
        const workspaceNpmrc = path.join(workspaceRoot, '.npmrc')
        await fs.writeFile(workspaceNpmrc, [
          `registry=${serverUrl}`,
          `//127.0.0.1:${port}/:_authToken=good-token`,
        ].join('\n'))
        // A second port on the same address: follow-redirects compares the
        // host INCLUDING the port, so this is a different host to it and
        // the header is stripped — deterministic, with no DNS involved.
        const cdn = http.createServer((req, res) => {
          requests.push({ url: req.url!, authorization: req.headers.authorization })
          res.statusCode = 404
          res.end('not found')
        })
        await new Promise<void>(resolve => cdn.listen(0, '127.0.0.1', resolve))
        const cdnPort = (cdn.address() as AddressInfo).port

        server.removeAllListeners('request')
        server.on('request', (req, res) => {
          requests.push({ url: req.url!, authorization: req.headers.authorization })
          res.statusCode = 302
          res.setHeader('location', `http://127.0.0.1:${cdnPort}${req.url!}`)
          res.end()
        })

        try {
          const error = await materializeAll(makeMaterializer(['secured'])).catch(err => err)
          // The redirect target never received the token, so saying it was
          // rejected would send the reader to rotate a working credential.
          expect(error.message).toContain(`redirected to '127.0.0.1:${cdnPort}'`)
          expect(error.message).toMatch(/dropped rather than forwarded/)
          expect(error.message).not.toMatch(/were rejected/)
          // The attribution survives, so the reader still learns which
          // source the original host was given.
          expect(error.message).toContain(`'//127.0.0.1:${port}/:_authToken' in '${workspaceNpmrc}'`)
          expect(requests[0].authorization).toBe('Bearer good-token')
          expect(requests[1]?.authorization).toBeUndefined()
        } finally {
          await new Promise<void>((resolve, reject) =>
            cdn.close(err => err ? reject(err) : resolve()))
        }
      })

      it('still blames the credentials when a redirect keeps them', async () => {
        await fs.writeFile(lockfilePath, securedLockfile)
        const { port } = server.address() as AddressInfo
        const workspaceNpmrc = path.join(workspaceRoot, '.npmrc')
        await fs.writeFile(workspaceNpmrc, [
          `registry=${serverUrl}`,
          `//127.0.0.1:${port}/:_authToken=good-token`,
        ].join('\n'))
        // A same-host redirect keeps the Authorization header, so the
        // credentials really were seen and rejected. Deriving the drop from
        // host comparison rather than observing it would misreport this.
        server.removeAllListeners('request')
        server.on('request', (req, res) => {
          requests.push({ url: req.url!, authorization: req.headers.authorization })
          if (req.url === '/secured/-/secured-1.0.0.tgz') {
            res.statusCode = 302
            res.setHeader('location', `http://127.0.0.1:${port}/moved/secured.tgz`)
            res.end()
            return
          }
          res.statusCode = 401
          res.end('unauthorized')
        })

        const error = await materializeAll(makeMaterializer(['secured'])).catch(err => err)
        expect(error.message).toMatch(/were rejected/)
        // Asserted positively: the credentials survived the hop, so the
        // message must say they were carried through it rather than
        // dropped. A negative assertion here passed on the coincidence
        // that the two sentences differ by one word.
        expect(error.message).toMatch(/carried through a redirect to/)
        expect(error.message).not.toMatch(/dropped rather than forwarded/)
        expect(requests[1]?.authorization).toBe('Bearer good-token')
      })

      it('lists the environment channel among the places it looked', async () => {
        await fs.writeFile(lockfilePath, securedLockfile)

        const error = await materializeAll(makeMaterializer(['secured'])).catch(err => err)
        // npm_config_* outranks every file, so omitting it would send the
        // reader to edit files that a set variable would override anyway.
        expect(error.message).toContain(`'npm_config_* environment variables'`)
      })

      it('names both files when a username/password pair is split across them', async () => {
        await fs.writeFile(lockfilePath, securedLockfile)
        const workspaceNpmrc = path.join(workspaceRoot, '.npmrc')
        const userNpmrc = path.join(homedir, '.npmrc')
        const nerfDart = `//127.0.0.1:${(server.address() as AddressInfo).port}/`
        await fs.writeFile(workspaceNpmrc, [
          `registry=${serverUrl}`,
          `${nerfDart}:username=alice`,
        ].join('\n'))
        // The password — the half that actually expires — lives elsewhere.
        await fs.writeFile(userNpmrc, `${nerfDart}:_password=${Buffer.from('secret').toString('base64')}\n`)

        const error = await materializeAll(makeMaterializer(['secured'])).catch(err => err)
        expect(error.message).toContain(`'${nerfDart}:username' in '${workspaceNpmrc}'`)
        expect(error.message).toContain(`'${nerfDart}:_password' in '${userNpmrc}'`)
        expect(error.message).not.toContain('secret')
      })

      it('explains a 404 that credentials did not unlock', async () => {
        await fs.writeFile(lockfilePath, securedLockfile)
        const workspaceNpmrc = path.join(workspaceRoot, '.npmrc')
        const nerfDart = `//127.0.0.1:${(server.address() as AddressInfo).port}/`
        await fs.writeFile(workspaceNpmrc, [
          `registry=${serverUrl}`,
          `${nerfDart}:_authToken=insufficient-token`,
        ].join('\n'))
        // A registry that hides packages the caller may not see answers 404
        // even once credentials are presented.
        server.removeAllListeners('request')
        server.on('request', (req, res) => {
          requests.push({ url: req.url!, authorization: req.headers.authorization })
          res.statusCode = 404
          res.end('not found')
        })

        const error = await materializeAll(makeMaterializer(['secured'])).catch(err => err)
        expect(error.message).toMatch(/HTTP 404/)
        expect(error.message).toMatch(/Credentials were sent but did not grant access/)
        expect(error.message).toContain(`'${nerfDart}:_authToken' in '${workspaceNpmrc}'`)
        expect(error.message).not.toContain('insufficient-token')
      })

      // A registry that hides unauthorized packages behind a 404 is the
      // case that reads as "package does not exist" without this hint.
      it('explains a 404 as a possible authorization failure', async () => {
        await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  missing@1.0.0:
    resolution: {integrity: ${barIntegrity}}
`)

        const error = await materializeAll(makeMaterializer(['missing'])).catch(err => err)
        expect(error.message).toMatch(/HTTP 404/)
        expect(error.message).toMatch(/may answer 404 for a package you are not authorized to see/)
      })

      it('reports a config file that exists but could not be read', async () => {
        await fs.writeFile(lockfilePath, securedLockfile)
        const authIni = path.join(homedir, 'pnpm', 'auth.ini')
        await fs.mkdir(path.dirname(authIni), { recursive: true })
        await fs.writeFile(authIni, 'registry=https://unreadable.example.com/\n')
        await fs.chmod(authIni, 0o000)
        try {
          await fs.readFile(authIni, 'utf8')
          return // Running as root: permission bits do not apply.
        } catch {
          // Expected: the file is genuinely unreadable.
        }

        const error = await materializeAll(makeMaterializer(['secured'], {
          env: { CHECKLY_CACHE_DIR: cacheDir, XDG_CONFIG_HOME: homedir },
        })).catch(err => err)
        expect(error.message).toContain(authIni)
        expect(error.message).toMatch(/could not be read/)
      })

      // axios sends userinfo credentials itself and drops the Authorization
      // header when it does, so reporting the config entry would name a
      // credential that never left the process.
      it('attributes credentials embedded in the registry URL to the key that configured it', async () => {
        await fs.writeFile(lockfilePath, securedLockfile)
        const workspaceNpmrc = path.join(workspaceRoot, '.npmrc')
        const { port } = server.address() as AddressInfo
        await fs.writeFile(workspaceNpmrc, [
          `registry=http://user:pass@127.0.0.1:${port}/`,
          `//127.0.0.1:${port}/:_authToken=unused-token`,
        ].join('\n'))

        const error = await materializeAll(makeMaterializer(['secured'])).catch(err => err)
        // The whole clause: an earlier revision nested 'the registry
        // configured by' inside 'the registry URL configured by', and a
        // prefix match did not notice.
        expect(error.message).toMatch(/came from the URL of the registry configured by '[^']+' in '[^']+'\.$/)
        expect(error.message).toContain(`'registry' in '${workspaceNpmrc}'`)
        expect(error.message).not.toContain('unused-token')
        expect(error.message).not.toContain('pass@')

        // The precedence rule rests on axios sending the URL's credentials
        // and dropping the Authorization header. Assert the wire, not just
        // the wording, so a change in that behaviour fails here.
        expect(requests[0].authorization)
          .toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`)
      })
    })

    it('refuses to materialize when the plan has issues', async () => {
      await expect(materializeAll(makeMaterializer(['no-such-package'])))
        .rejects.toThrow(EmbeddedPackageError)
    })

    it('prefers the context directory .npmrc over the workspace root one', async () => {
      const contextDir = path.join(workspaceRoot, 'packages', 'a')
      await fs.mkdir(contextDir, { recursive: true })
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), 'registry=http://127.0.0.1:1/\n')
      await fs.writeFile(path.join(contextDir, '.npmrc'), `registry=${serverUrl}\n`)

      const tarballs = await materializeAll(makeMaterializer(['bar@2.0.0'], { contextDir }))
      expect(tarballs).toHaveLength(1)
      expect(requests).toHaveLength(1)
    })

    it('honors an npm_config_registry environment override', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), 'registry=http://127.0.0.1:1/\n')

      const materializer = makeMaterializer(['bar@2.0.0'], {
        env: { CHECKLY_CACHE_DIR: cacheDir, npm_config_registry: serverUrl },
      })
      const tarballs = await materializeAll(materializer)
      expect(tarballs).toHaveLength(1)
      expect(requests).toHaveLength(1)
    })

    it.each([
      // Each breaks a different one of the three rules, and the message
      // states all three rather than guessing which: telling the reader of
      // a `file:` URL to add a protocol sends them looking for one it has.
      ['no protocol', 'nexus.local/repository/npm/'],
      ['no host, so the package name would become one', 'https://'],
      ['one slash, so the package name would become the host', 'https:/'],
      ['a scheme nothing here can fetch', 'ftp://nexus.local/npm/'],
      ['a scheme that never has a host', 'file:///srv/npm-mirror/'],
      // A query absorbs whatever is appended to it, so the package path
      // would vanish into it and every request would hit the root.
      ['a query', 'https://nexus.local/repository/npm/?token=abc'],
      ['a fragment', 'https://nexus.local/repository/npm/#tok'],
      ['a bare query delimiter', 'https://nexus.local/repository/npm/?'],
      ['a bare fragment delimiter', 'https://nexus.local/repository/npm/#'],
    ])('refuses a registry with %s', async (_label, registry) => {
      // `https://` composes into `https://bar/-/bar-2.0.0.tgz`, whose host
      // is the package name — a real host somebody else may own.
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), `registry=${registry}\n`)

      const error = await materializeAll(makeMaterializer(['bar@2.0.0'])).catch(err => err)
      expect(error.message).toMatch(/registry URL.*is not usable/s)
      expect(error.message).toMatch(/must be an absolute http or https URL with a host/)
      expect(error.message).toContain(`'registry' in '${path.join(workspaceRoot, '.npmrc')}'`)
      expect(requests).toHaveLength(0)
    })

    // Each of these registry values produces a URL the parser cannot make
    // sense of, so redaction falls back to string surgery. Every one of
    // them leaked a credential at some point during development.
    it.each([
      ['an @ in the password', '//user:p@ss@nexus.local/npm/', ['ss@', 'user:']],
      ['no protocol and no leading slashes', 'admin:s3cret@nexus.local/npm/', ['s3cret', 'admin:']],
      ['a scheme with an out-of-range port', 'https://user:tok@nexus.local:99999/npm/', ['tok@', 'user:']],
      ['whitespace inside the credential', 'https://user:pa ss@nexus.local:99999/npm/', ['pa ss', 'user:']],
    ])('redacts credentials from an unparseable registry URL with %s', async (_label, registry, forbidden) => {
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), `registry=${registry}\n`)

      const error = await materializeAll(makeMaterializer(['bar@2.0.0'])).catch(err => err)
      expect(error.message).toMatch(/is not usable/)
      for (const secret of forbidden) {
        expect(error.message).not.toContain(secret)
      }
    })

    it('redacts registry credentials from download error messages', async () => {
      const { port } = server.address() as AddressInfo
      await fs.writeFile(
        path.join(workspaceRoot, '.npmrc'),
        `registry=http://ci-user:super-secret@127.0.0.1:${port}/\n`,
      )
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  missing-pkg@1.0.0:
    resolution: {integrity: ${barIntegrity}}
`)

      const error = await materializeAll(makeMaterializer(['missing-pkg'])).catch(err => err)
      expect(error).toBeInstanceOf(EmbeddedPackageError)
      expect(error.message).not.toContain('super-secret')
      expect(error.message).toContain('missing-pkg')
    })

    it('serves a repeated materialization from the CLI cache without re-downloading', async () => {
      const materializer = makeMaterializer(['bar@2.0.0'])
      const first = await materializeAll(materializer)
      const second = await materializeAll(materializer)
      expect(second).toEqual(first)
      expect(requests).toHaveLength(1)
    })
  })

  describe('materializeTarballs() from a yarn.lock plan', () => {
    // yarn.lock entries carry no npm tarball integrity (Berry checksums
    // hash yarn's own cache archive), so the materializer must resolve it
    // from the registry's per-version metadata before downloading.
    const writeYarnLockfile = async () => {
      lockfilePath = path.join(workspaceRoot, 'yarn.lock')
      await fs.writeFile(lockfilePath, `
__metadata:
  version: 10
  cacheKey: 10c0

"@acme/foo@npm:1.2.3":
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
    }

    const serveMetadata = (routes: Record<string, unknown>) => {
      server.removeAllListeners('request')
      server.on('request', (req, res) => {
        requests.push({
          url: req.url!,
          authorization: req.headers.authorization,
          acceptEncoding: req.headers['accept-encoding'] as string | undefined,
        })
        const body = routes[req.url!]
        if (body === undefined) {
          res.statusCode = 404
          res.end('not found')
        } else if (typeof body === 'number') {
          // A numeric route value is an HTTP status to return.
          res.statusCode = body
          res.end('error')
        } else if (Buffer.isBuffer(body)) {
          res.end(body)
        } else {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
      })
    }

    it('resolves the integrity from registry metadata and verifies the download', async () => {
      await writeYarnLockfile()
      serveMetadata({
        '/bar/2.0.0': { dist: { integrity: barIntegrity, tarball: `${serverUrl}bar/-/bar-2.0.0.tgz` } },
        '/bar/-/bar-2.0.0.tgz': barTarball,
      })

      const tarballs = await materializeAll(makeMaterializer(['bar@2.0.0']))
      expect(tarballs).toHaveLength(1)
      expect(tarballs[0].integrity).toEqual(barIntegrity)
      expect(await fs.readFile(tarballs[0].filePath)).toEqual(barTarball)
      expect(requests.map(request => request.url)).toEqual(['/bar/2.0.0', '/bar/-/bar-2.0.0.tgz'])
    })

    it('requests scoped metadata with the scope slash unencoded and derives the tarball URL', async () => {
      await writeYarnLockfile()
      // No dist.tarball in the metadata: the download must fall back to the
      // registry-derived URL.
      serveMetadata({
        '/@acme/foo/1.2.3': { dist: { integrity: fooIntegrity } },
        '/@acme/foo/-/foo-1.2.3.tgz': fooTarball,
      })

      const tarballs = await materializeAll(makeMaterializer(['@acme/foo']))
      expect(tarballs[0].integrity).toEqual(fooIntegrity)
      expect(requests.map(request => request.url)).toEqual(['/@acme/foo/1.2.3', '/@acme/foo/-/foo-1.2.3.tgz'])
    })

    it('falls back to the full packument when the per-version route 404s', async () => {
      // Some private registry proxies serve only the full packument, not
      // the abbreviated per-version route.
      await writeYarnLockfile()
      serveMetadata({
        '/bar': { versions: { '2.0.0': { dist: { integrity: barIntegrity, tarball: `${serverUrl}bar/-/bar-2.0.0.tgz` } } } },
        '/bar/-/bar-2.0.0.tgz': barTarball,
      })

      const tarballs = await materializeAll(makeMaterializer(['bar@2.0.0']))
      expect(tarballs[0].integrity).toEqual(barIntegrity)
      // The per-version route was tried first (404), then the packument.
      expect(requests.map(request => request.url)).toEqual(['/bar/2.0.0', '/bar', '/bar/-/bar-2.0.0.tgz'])
    })

    it('does not fall back to the packument when the per-version route answers without a hash', async () => {
      // A per-version response that simply lacks integrity is a real
      // answer, not an absent route, so it must not trigger a second fetch.
      await writeYarnLockfile()
      serveMetadata({
        '/bar/2.0.0': { dist: { tarball: `${serverUrl}bar/-/bar-2.0.0.tgz` } },
        '/bar': { versions: { '2.0.0': { dist: { integrity: barIntegrity } } } },
      })

      await expect(materializeAll(makeMaterializer(['bar@2.0.0'])))
        .rejects.toThrow(/provides no usable integrity hash/)
      expect(requests.map(request => request.url)).toEqual(['/bar/2.0.0'])
    })

    it('falls back to a sha1 shasum when the metadata has no integrity', async () => {
      await writeYarnLockfile()
      const shasum = createHash('sha1').update(barTarball).digest('hex')
      serveMetadata({
        '/bar/2.0.0': { dist: { shasum, tarball: `${serverUrl}bar/-/bar-2.0.0.tgz` } },
        '/bar/-/bar-2.0.0.tgz': barTarball,
      })

      const tarballs = await materializeAll(makeMaterializer(['bar@2.0.0']))
      expect(tarballs[0].integrity).toEqual(`sha1-${Buffer.from(shasum, 'hex').toString('base64')}`)
    })

    it('fails with a clear error when the metadata request errors (non-404)', async () => {
      // A 404 means "try the other route"; any other status is a hard
      // failure that must surface rather than fall through.
      await writeYarnLockfile()
      serveMetadata({ '/bar/2.0.0': 500 })

      await expect(materializeAll(makeMaterializer(['bar@2.0.0'])))
        .rejects.toThrow(/Failed to fetch registry metadata for embedded package 'bar@2.0.0'/)
      // The 500 stops the resolution; the packument fallback is not tried.
      expect(requests.map(request => request.url)).toEqual(['/bar/2.0.0'])
    })

    it('fails with a clear error when neither metadata route exists', async () => {
      await writeYarnLockfile()
      serveMetadata({})

      const error = await materializeAll(makeMaterializer(['bar@2.0.0'])).catch(err => err)
      // Not "no usable integrity hash": there was no metadata at all, and a
      // private registry answers 404 for packages the caller may not see.
      expect(error.message).toMatch(/has no metadata for embedded package/)
      expect(error.message).not.toMatch(/provides no usable integrity hash/)
      expect(error.message).toMatch(/No credentials for this registry were found/)
      expect(requests.map(request => request.url)).toEqual(['/bar/2.0.0', '/bar'])
    })

    it('names the rejected credentials when neither metadata route exists', async () => {
      await writeYarnLockfile()
      const { port } = server.address() as AddressInfo
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        `registry=${serverUrl}`,
        `//127.0.0.1:${port}/:_authToken=stale`,
      ].join('\n'))
      serveMetadata({})

      const error = await materializeAll(makeMaterializer(['bar@2.0.0'])).catch(err => err)
      expect(error.message).toContain(`'//127.0.0.1:${port}/:_authToken'`)
      expect(error.message).not.toContain('stale')
    })

    it('does not blame credentials when the metadata answers without this version', async () => {
      // The registry accepted the request and simply lacks the version, so
      // an authentication hint would send the reader to rotate a token the
      // registry had just honoured.
      await writeYarnLockfile()
      const { port } = server.address() as AddressInfo
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        `registry=${serverUrl}`,
        `//127.0.0.1:${port}/:_authToken=works`,
      ].join('\n'))
      serveMetadata({ '/bar': { versions: { '1.0.0': { dist: {} } } } })

      const error = await materializeAll(makeMaterializer(['bar@2.0.0'])).catch(err => err)
      expect(error.message).toMatch(/does not describe embedded package 'bar@2.0.0'/)
      expect(error.message).not.toMatch(/[Cc]redentials/)
      expect(error.message).not.toMatch(/has no metadata/)
    })

    it('reports a config file it could not read when the metadata has nothing', async () => {
      // A skipped `auth.ini` is invisible otherwise, and it is the likeliest
      // thing to be missing when a private package cannot be resolved at all.
      await writeYarnLockfile()
      const authIni = path.join(homedir, 'pnpm', 'auth.ini')
      await fs.mkdir(path.dirname(authIni), { recursive: true })
      await fs.writeFile(authIni, '//127.0.0.1/:_authToken=unreadable\n')
      await fs.chmod(authIni, 0o000)
      try {
        await fs.readFile(authIni, 'utf8')
        // Root ignores the permission bits, and Windows honours only the
        // write bit, so there is nothing unreadable to report. Probing
        // beats testing the platform: it is the read that has to fail.
        return
      } catch {
        // Expected: the file is genuinely unreadable.
      }
      // The registry must ANSWER without the version: a 404 from both
      // routes takes the other branch, which already said this.
      serveMetadata({ '/bar': { versions: { '1.0.0': { dist: {} } } } })

      const error = await materializeAll(makeMaterializer(['bar@2.0.0'], {
        env: { CHECKLY_CACHE_DIR: cacheDir, XDG_CONFIG_HOME: homedir },
      })).catch(err => err)
      expect(error.message).toMatch(/does not describe embedded package/)
      expect(error.message).toMatch(/could not be read/)
      expect(error.message).toContain(authIni)
    })

    it('treats an explicit null dist as absent and falls back to the packument', async () => {
      // A registry may answer with `"dist": null` rather than omitting it.
      // Read literally that is neither absent nor usable, and it once both
      // suppressed this fallback and crashed on the property read below.
      await writeYarnLockfile()
      serveMetadata({
        '/bar/2.0.0': { dist: null },
        '/bar': { versions: { '2.0.0': { dist: { integrity: barIntegrity, tarball: `${serverUrl}bar.tgz` } } } },
        '/bar.tgz': barTarball,
      })

      const tarballs = await materializeAll(makeMaterializer(['bar@2.0.0']))
      expect(tarballs).toHaveLength(1)
      expect(requests.map(request => request.url)).toContain('/bar')
    })

    it('refuses a host-less registry before requesting metadata', async () => {
      // `https://` composes into `https://bar/2.0.0`, whose host is the
      // package name — a real host somebody else may own. The composed form
      // parses, so only checking the registry URL itself catches it.
      await writeYarnLockfile()
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), 'registry=https://\n')

      const error = await materializeAll(makeMaterializer(['bar@2.0.0'])).catch(err => err)
      expect(error.message).toMatch(/registry URL.*is not usable/s)
      expect(requests).toHaveLength(0)
    })

    it('attributes credentials in a metadata-supplied tarball URL to the registry', async () => {
      // The registry minted them into the URL its own metadata returned, so
      // they are in no file the reader can open — naming the registry
      // config line would send them somewhere that holds no credentials.
      await writeYarnLockfile()
      const { port } = server.address() as AddressInfo
      serveMetadata({
        '/bar/2.0.0': {
          dist: { integrity: barIntegrity, tarball: `http://svc:tok@127.0.0.1:${port}/bar/-/bar-2.0.0.tgz` },
        },
        '/bar/-/bar-2.0.0.tgz': 401,
      })

      const error = await materializeAll(makeMaterializer(['bar@2.0.0'])).catch(err => err)
      expect(error.message).toContain('returned in this package\'s metadata')
      expect(error.message).toContain('issued by that registry rather than configured here')
      // The userinfo itself must never appear; 'tok' alone would match the
      // word "token" in the hint's own wording.
      expect(error.message).not.toContain('svc:')
      expect(error.message).not.toContain('tok@')
    })

    it('blames the registry URL for credentials it carries when metadata is rejected', async () => {
      // axios sends userinfo from the URL itself and drops the
      // Authorization header when it does, so reporting no credentials
      // would tell the reader to add what was in fact sent and rejected.
      await writeYarnLockfile()
      const { port } = server.address() as AddressInfo
      await fs.writeFile(
        path.join(workspaceRoot, '.npmrc'),
        `registry=http://ci-user:tok@127.0.0.1:${port}/\n`,
      )
      serveMetadata({ '/bar/2.0.0': 401 })

      const error = await materializeAll(makeMaterializer(['bar@2.0.0'])).catch(err => err)
      // The whole clause: an earlier revision nested 'the registry
      // configured by' inside 'the registry URL configured by', and a
      // prefix match did not notice.
      expect(error.message).toMatch(/came from the URL of the registry configured by '[^']+' in '[^']+'\.$/)
      expect(error.message).not.toMatch(/No credentials for this registry were found/)
      expect(error.message).not.toContain('ci-user')
    })

    it('fails with a clear error when the metadata provides no usable hash', async () => {
      await writeYarnLockfile()
      serveMetadata({
        '/bar/2.0.0': { dist: { tarball: `${serverUrl}bar/-/bar-2.0.0.tgz` } },
      })

      await expect(materializeAll(makeMaterializer(['bar@2.0.0'])))
        .rejects.toThrow(/provides no usable integrity hash/)
    })

    it('sends registry credentials with the metadata request', async () => {
      await writeYarnLockfile()
      const { port } = server.address() as AddressInfo
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        `registry=${serverUrl}`,
        `//127.0.0.1:${port}/:_authToken=secret`,
      ].join('\n'))
      serveMetadata({
        '/bar/2.0.0': { dist: { integrity: barIntegrity, tarball: `${serverUrl}bar/-/bar-2.0.0.tgz` } },
        '/bar/-/bar-2.0.0.tgz': barTarball,
      })

      await materializeAll(makeMaterializer(['bar@2.0.0']))
      expect(requests[0]).toMatchObject({ url: '/bar/2.0.0', authorization: 'Bearer secret' })
    })

    it('sends a scope-qualified credential with the metadata request', async () => {
      // The metadata route resolves credentials separately from the
      // download, so it needs its own proof that the package name reaches
      // the lookup — a scoped key resolves only if it does.
      await writeYarnLockfile()
      const { port } = server.address() as AddressInfo
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        `registry=${serverUrl}`,
        `//127.0.0.1:${port}/:@acme:_authToken=scoped-secret`,
      ].join('\n'))
      serveMetadata({
        '/@acme/foo/1.2.3': { dist: { integrity: fooIntegrity, tarball: `${serverUrl}@acme/foo/-/foo-1.2.3.tgz` } },
        '/@acme/foo/-/foo-1.2.3.tgz': fooTarball,
      })

      await materializeAll(makeMaterializer(['@acme/foo']))
      expect(requests[0]).toMatchObject({ url: '/@acme/foo/1.2.3', authorization: 'Bearer scoped-secret' })
    })

    // The metadata route resolves its own registry URL, so the guard on it
    // needs its own coverage: the tarball-path cases above run on a pnpm
    // lockfile and never reach this code.
    it.each([
      ['registry', 'registry=nexus.local/repository/npm/', 'bar@2.0.0'],
      // The key named must be the one at fault, not the global default.
      ['@acme:registry', '@acme:registry=nexus.local/npm/', '@acme/foo'],
      // Parses, but as the opaque scheme `admin:` with no host, so nothing
      // can separate the credential from a path — it is withheld entirely.
      ['registry', 'registry=admin:s3cret@nexus.local/npm/', 'bar@2.0.0'],
    ])('refuses an unusable %s before requesting metadata', async (key, line, spec) => {
      await writeYarnLockfile()
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), `${line}\n`)

      const error = await materializeAll(makeMaterializer([spec])).catch(err => err)
      expect(error.message).toMatch(/registry URL.*is not usable/s)
      expect(error.message).toContain(`'${key}' in '${path.join(workspaceRoot, '.npmrc')}'`)
      expect(error.message).not.toContain('s3cret')
      expect(error.message).not.toContain('admin:')
      expect(requests).toHaveLength(0)
    })

    it('blames the registry, not the lockfile, for an unusable metadata tarball URL', async () => {
      // Yarn plans learn the tarball URL from the registry's own metadata,
      // so a bad one is not something the project can fix in its lockfile.
      await writeYarnLockfile()
      serveMetadata({
        '/bar/2.0.0': { dist: { integrity: barIntegrity, tarball: 'https://' } },
      })

      const error = await materializeAll(makeMaterializer(['bar@2.0.0'])).catch(err => err)
      expect(error.message).toMatch(/tarball URL.*is not a valid URL/s)
      expect(error.message).toContain('package metadata served by')
      expect(error.message).not.toContain(lockfilePath)
      expect(error.message).not.toContain('malformed package name')
    })

    it('still resolves metadata on a warm cache, but skips the download', async () => {
      // The caches are keyed by integrity, which for yarn plans is only
      // learnable from the registry — so the (small) metadata roundtrip
      // happens every run, while the tarball itself is served from cache.
      await writeYarnLockfile()
      serveMetadata({
        '/bar/2.0.0': { dist: { integrity: barIntegrity, tarball: `${serverUrl}bar/-/bar-2.0.0.tgz` } },
        '/bar/-/bar-2.0.0.tgz': barTarball,
      })

      await materializeAll(makeMaterializer(['bar@2.0.0']))
      const second = await materializeAll(makeMaterializer(['bar@2.0.0']))
      expect(second).toHaveLength(1)
      expect(requests.map(request => request.url)).toEqual([
        '/bar/2.0.0', '/bar/-/bar-2.0.0.tgz', '/bar/2.0.0',
      ])
    })
  })
})
