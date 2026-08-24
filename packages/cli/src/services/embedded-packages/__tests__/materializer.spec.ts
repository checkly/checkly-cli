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

    it('fails with a clear error for a registry URL without a protocol', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), 'registry=nexus.local/repository/npm/\n')

      await expect(materializeAll(makeMaterializer(['bar@2.0.0'])))
        .rejects.toThrow(/is not a valid URL.*registry/s)
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

      await expect(materializeAll(makeMaterializer(['bar@2.0.0'])))
        .rejects.toThrow(/provides no usable integrity hash/)
      expect(requests.map(request => request.url)).toEqual(['/bar/2.0.0', '/bar'])
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
