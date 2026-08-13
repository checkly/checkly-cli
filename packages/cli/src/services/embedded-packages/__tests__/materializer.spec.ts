import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { AddressInfo } from 'node:net'

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

    it('reports unfetchable wildcard matches as plan warnings and announces matches when materializing', async () => {
      // A bare * matches bar (registry, both versions) and git-dep (a git
      // dependency the CLI cannot embed): the registry matches embed, the
      // git dependency surfaces as a plan warning naming it, and the
      // wildcard's selection is announced during materialization.
      const materializer = makeMaterializer(['*'])
      const { tarballs, issues, warnings } = await materializer.plan()
      expect(issues).toEqual([])
      expect(tarballs.map(t => t.archiveFilename)).toEqual(['bar@2.0.0.tgz', 'bar@3.0.0.tgz'])
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('git-dep')
      expect(warnings[0]).toContain('cannot be embedded')
      const written = await captureStderr(async () => {
        await materializer.materialize()
      })
      const announcement = written.find(line => line.includes('matched 2 package(s)'))
      expect(announcement).toContain(`'*'`)
      expect(announcement).toContain('bar@2.0.0')
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
        await materializer.materialize()
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
      expect(issues[0].type).toBe('spec-not-found')
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

    it('reports a version pin that matches nothing in the lockfile', async () => {
      const { issues } = await makeMaterializer(['bar@9.9.9']).plan()
      expect(issues[0].type).toBe('spec-not-found')
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

  describe('materialize()', () => {
    it('downloads tarballs from the registry and verifies them', async () => {
      const tarballs = await makeMaterializer(['@acme/foo', 'bar@2.0.0']).materialize()
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
      const tarballs = await makeMaterializer(['bar@2.0.0'], { env: {} }).materialize()
      expect(tarballs[0].filePath.startsWith(
        path.join(workspaceRoot, 'node_modules', '.cache', 'checkly', 'embedded-packages'),
      )).toBe(true)
    })

    it('derives the project root from the lockfile path when no workspace root is given', async () => {
      const tarballs = await makeMaterializer(['bar@2.0.0'], { env: {}, workspaceRoot: undefined }).materialize()
      expect(tarballs[0].filePath.startsWith(path.join(
        path.dirname(lockfilePath), 'node_modules', '.cache', 'checkly', 'embedded-packages',
      ))).toBe(true)
    })

    it('reuses the CLI cache instead of downloading again', async () => {
      await makeMaterializer(['bar@2.0.0']).materialize()
      expect(requests).toHaveLength(1)
      await makeMaterializer(['bar@2.0.0']).materialize()
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
      const tarballs = await materializer.materialize()
      expect(requests).toHaveLength(0)
      await expect(fs.readFile(tarballs[0].filePath)).resolves.toEqual(barTarball)
    })

    it('sends npmrc credentials for the registry', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        `registry=${serverUrl}`,
        `//127.0.0.1:${(server.address() as AddressInfo).port}/:_authToken=secret`,
      ].join('\n'))

      await makeMaterializer(['bar@2.0.0']).materialize()
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

      await makeMaterializer(['bar@2.0.0']).materialize()
      expect(requests[0].url).toBe('/custom/path/bar-2.0.0.tgz')
    })

    it('fails with a clear error on an integrity mismatch', async () => {
      server.removeAllListeners('request')
      server.on('request', (req, res) => res.end('tampered content'))

      await expect(makeMaterializer(['bar@2.0.0']).materialize())
        .rejects.toThrow(/does not match the integrity hash recorded in the lockfile/)
    })

    it('fails with a clear error on a download failure', async () => {
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  secured@1.0.0:
    resolution: {integrity: ${barIntegrity}}
`)
      await expect(makeMaterializer(['secured']).materialize())
        .rejects.toThrow(/Failed to download embedded package 'secured@1\.0\.0'.*HTTP 401.*credentials/s)
    })

    it('refuses to materialize when the plan has issues', async () => {
      await expect(makeMaterializer(['no-such-package']).materialize())
        .rejects.toThrow(EmbeddedPackageError)
    })

    it('prefers the context directory .npmrc over the workspace root one', async () => {
      const contextDir = path.join(workspaceRoot, 'packages', 'a')
      await fs.mkdir(contextDir, { recursive: true })
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), 'registry=http://127.0.0.1:1/\n')
      await fs.writeFile(path.join(contextDir, '.npmrc'), `registry=${serverUrl}\n`)

      const tarballs = await makeMaterializer(['bar@2.0.0'], { contextDir }).materialize()
      expect(tarballs).toHaveLength(1)
      expect(requests).toHaveLength(1)
    })

    it('honors an npm_config_registry environment override', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), 'registry=http://127.0.0.1:1/\n')

      const materializer = makeMaterializer(['bar@2.0.0'], {
        env: { CHECKLY_CACHE_DIR: cacheDir, npm_config_registry: serverUrl },
      })
      const tarballs = await materializer.materialize()
      expect(tarballs).toHaveLength(1)
      expect(requests).toHaveLength(1)
    })

    it('fails with a clear error for a registry URL without a protocol', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), 'registry=nexus.local/repository/npm/\n')

      await expect(makeMaterializer(['bar@2.0.0']).materialize())
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

      const error = await makeMaterializer(['missing-pkg']).materialize().catch(err => err)
      expect(error).toBeInstanceOf(EmbeddedPackageError)
      expect(error.message).not.toContain('super-secret')
      expect(error.message).toContain('missing-pkg')
    })

    it('memoizes materialization within an instance', async () => {
      const materializer = makeMaterializer(['bar@2.0.0'])
      const [first, second] = await Promise.all([materializer.materialize(), materializer.materialize()])
      expect(first).toBe(second)
      expect(requests).toHaveLength(1)
    })
  })

  describe('materialize() with detection', () => {
    const pubIntegrity = `sha512-${createHash('sha512').update('public artifact bytes').digest('base64')}`

    // The server plays three roles: the project's Nexus-shaped registry
    // (content under /repository/, REST API under /service/rest/v1) and,
    // for fallback tests, a fake public registry under /public/.
    let restMode: 'ok' | 'forbidden'
    let publicBarMode: 'ok' | 'error'
    let registryUrl: string

    const usePublicAwareServer = () => {
      server.removeAllListeners('request')
      server.on('request', (req, res) => {
        requests.push({ url: req.url!, authorization: req.headers.authorization })
        const respond = (body: unknown) => {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.url!.startsWith('/service/rest/v1/')) {
          if (restMode === 'forbidden') {
            res.statusCode = 403
            return res.end('forbidden')
          }
          if (req.url === '/service/rest/v1/repositories') {
            return respond([
              { name: 'npm-private', format: 'npm', type: 'hosted' },
              { name: 'npm-proxy', format: 'npm', type: 'proxy' },
              { name: 'npm-group', format: 'npm', type: 'group' },
            ])
          }
          if (req.url!.startsWith('/service/rest/v1/components?repository=npm-private')) {
            return respond({
              items: [
                {
                  repository: 'npm-private',
                  format: 'npm',
                  group: null,
                  name: 'bar',
                  version: '2.0.0',
                  assets: [{ checksum: {}, npm: { name: 'bar', version: '2.0.0' } }],
                },
                {
                  repository: 'npm-private',
                  format: 'npm',
                  group: null,
                  name: 'bar',
                  version: '3.0.0',
                  assets: [{ checksum: {}, npm: { name: 'bar', version: '3.0.0' } }],
                },
                {
                  repository: 'npm-private',
                  format: 'npm',
                  group: null,
                  name: 'odd-pkg',
                  version: '1.0.0',
                  assets: [{ checksum: {}, npm: { name: 'odd-pkg', version: '1.0.0' } }],
                },
              ],
              continuationToken: null,
            })
          }
          res.statusCode = 404
          return res.end('not found')
        }
        if (publicBarMode === 'error' && req.url === '/public/bar') {
          res.statusCode = 500
          return res.end('boom')
        }
        if (req.url === '/public/pub-pkg') {
          return respond({ versions: { '1.2.3': { dist: { integrity: pubIntegrity } } } })
        }
        if (req.url!.startsWith('/public/')) {
          res.statusCode = 404
          return res.end('not found')
        }
        if (req.url!.endsWith('.tgz')) {
          return res.end(barTarball)
        }
        res.statusCode = 404
        res.end('not found')
      })
    }

    const detectLockfile = () => `
lockfileVersion: '9.0'
packages:
  bar@2.0.0:
    resolution: {integrity: ${barIntegrity}}
  pub-pkg@1.2.3:
    resolution: {integrity: ${pubIntegrity}}
`

    const makeDetecting = (specs: string[] = [], overrides: Record<string, unknown> = {}) =>
      makeMaterializer(specs, {
        detect: true,
        publicRegistryUrl: `${serverUrl}public/`,
        ...overrides,
      })

    // A function rather than a constant because registryUrl is assigned in
    // beforeEach.
    const barLockEntry = () => ({
      version: '2.0.0',
      resolved: `${registryUrl}bar/-/bar-2.0.0.tgz`,
      integrity: barIntegrity,
    })

    const writeNpmLockfile = async (
      packages: Record<string, { version: string, resolved: string, integrity: string }>,
    ) => {
      const npmLockfilePath = path.join(workspaceRoot, 'package-lock.json')
      await fs.writeFile(npmLockfilePath, JSON.stringify({
        lockfileVersion: 3,
        packages: Object.fromEntries(
          Object.entries(packages).map(([name, entry]) => [`node_modules/${name}`, entry]),
        ),
      }))
      return npmLockfilePath
    }

    const captureStderr = async (fn: () => Promise<void>): Promise<string[]> => {
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

    beforeEach(async () => {
      restMode = 'ok'
      publicBarMode = 'ok'
      usePublicAwareServer()
      registryUrl = `${serverUrl}repository/npm-group/`
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), `registry=${registryUrl}\n`)
      await fs.writeFile(lockfilePath, detectLockfile())
    })

    it('embeds only privately hosted packages, asking only the private registry', async () => {
      const tarballs = await makeDetecting().materialize()
      expect(tarballs.map(t => `${t.name}@${t.version}`)).toEqual(['bar@2.0.0'])
      expect(tarballs[0].detected).toBe(true)
      expect(requests.map(r => r.url).sort()).toEqual([
        '/repository/npm-group/bar/-/bar-2.0.0.tgz',
        '/service/rest/v1/components?repository=npm-private',
        '/service/rest/v1/repositories',
      ])
      // The load-bearing privacy property: nothing was sent to the public
      // registry.
      expect(requests.some(r => r.url.startsWith('/public/'))).toBe(false)
    })

    it('reuses the summary cache on an unchanged lockfile', async () => {
      await makeDetecting().materialize()
      requests = []
      const tarballs = await makeDetecting().materialize()
      expect(tarballs.map(t => t.name)).toEqual(['bar'])
      expect(requests).toHaveLength(0)
    })

    it('re-interrogates the registry API on lockfile changes without re-downloading', async () => {
      await makeDetecting().materialize()
      requests = []
      await fs.writeFile(lockfilePath, `${detectLockfile()}  baz@3.0.0:
    resolution: {integrity: ${barIntegrity}}
`)
      const tarballs = await makeDetecting().materialize()
      expect(tarballs.map(t => t.name).sort()).toEqual(['bar'])
      // The registry API is asked again (inventory verdicts depend on
      // registry topology and are deliberately not cached per entry), but
      // the already-cached tarball is not re-downloaded.
      expect(requests.map(r => r.url).every(url => url.startsWith('/service/rest/v1/'))).toBe(true)
    })

    it('caches fallback verdicts per entry so only new entries are diffed', async () => {
      restMode = 'forbidden'
      await makeDetecting([], { detectionFallback: 'public-registry' }).materialize()
      requests = []
      await fs.writeFile(lockfilePath, `${detectLockfile()}  baz@3.0.0:
    resolution: {integrity: ${barIntegrity}}
`)
      await makeDetecting([], { detectionFallback: 'public-registry' }).materialize()
      expect(requests.map(r => r.url).filter(url => url.startsWith('/public/'))).toEqual(['/public/baz'])
    })

    it('lets an explicit entry take over its name, but warns about pin-blocked private versions', async () => {
      // Both bar versions are in the lockfile and privately hosted. The
      // explicit pin owns the name, so detection must not add bar@3.0.0 —
      // but it warns, because detection proved private a version the
      // bundle will not carry.
      await fs.writeFile(lockfilePath, `${detectLockfile()}  bar@3.0.0:
    resolution: {integrity: ${barIntegrity}}
`)
      let tarballs: Awaited<ReturnType<EmbeddedPackagesMaterializer['materialize']>> = []
      const written = await captureStderr(async () => {
        tarballs = await makeDetecting(['bar@2.0.0']).materialize()
      })
      expect(tarballs.map(t => `${t.name}@${t.version}`)).toEqual(['bar@2.0.0'])
      expect(tarballs[0].detected).toBeUndefined()
      const warning = written.find(line => line.includes('bar@3.0.0'))
      expect(warning).toBeDefined()
      expect(warning).toContain('pins their names to other versions')
      expect(tarballs[0].detected).toBeUndefined()
    })

    it('embeds scope-mapped packages without any registry API traffic', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        'registry=https://registry.npmjs.org/',
        `@acme:registry=${registryUrl}`,
      ].join('\n'))
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  '@acme/foo@1.2.3':
    resolution: {integrity: ${fooIntegrity}}
  pub-pkg@1.2.3:
    resolution: {integrity: ${pubIntegrity}}
`)
      server.removeAllListeners('request')
      server.on('request', (req, res) => {
        requests.push({ url: req.url!, authorization: req.headers.authorization })
        res.end(fooTarball)
      })

      const tarballs = await makeDetecting().materialize()
      expect(tarballs.map(t => t.name)).toEqual(['@acme/foo'])
      expect(requests.map(r => r.url)).toEqual(['/repository/npm-group/@acme/foo/-/foo-1.2.3.tgz'])
    })

    it('skips undecided packages with a warning when the registry API is unavailable', async () => {
      restMode = 'forbidden'
      const tarballs = await makeDetecting().materialize()
      expect(tarballs).toEqual([])
      // No fallback to the public registry without the explicit opt-in.
      expect(requests.some(r => r.url.startsWith('/public/'))).toBe(false)
    })

    it('keeps scope-mapped embeds when the undecided tier degrades', async () => {
      restMode = 'forbidden'
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        `registry=${registryUrl}`,
        `@acme:registry=${serverUrl}repository/npm-scope/`,
      ].join('\n'))
      await fs.writeFile(lockfilePath, `${detectLockfile()}  '@acme/foo@1.2.3':
    resolution: {integrity: ${fooIntegrity}}
`)
      const workingServer = server.listeners('request')[0] as http.RequestListener
      server.removeAllListeners('request')
      server.on('request', (req, res) => {
        if (req.url!.includes('foo')) {
          requests.push({ url: req.url!, authorization: req.headers.authorization })
          return res.end(fooTarball)
        }
        workingServer(req as never, res as never)
      })

      const tarballs = await makeDetecting().materialize()
      // The undecided entries (bar, pub-pkg) are skipped with a warning,
      // but the scope-mapped package detection already proved private with
      // zero network is still embedded.
      expect(tarballs.map(t => t.name)).toEqual(['@acme/foo'])
    })

    it('degrades with a warning naming the unset variable a registry mapping references', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), 'registry=${RED862_UNSET_REGISTRY}\n')
      let tarballs: Awaited<ReturnType<EmbeddedPackagesMaterializer['materialize']>> = []
      const written = await captureStderr(async () => {
        tarballs = await makeDetecting().materialize()
      })
      expect(tarballs).toEqual([])
      const warning = written.find(line => line.includes('could not determine'))
      expect(warning).toBeDefined()
      expect(warning).toContain('RED862_UNSET_REGISTRY')
    })

    it('skips detection with a warning for a registry URL without the Nexus layout', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), `registry=${serverUrl}\n`)
      const tarballs = await makeDetecting().materialize()
      expect(tarballs).toEqual([])
      expect(requests.some(r => r.url.startsWith('/public/'))).toBe(false)
    })

    it('does not cache degraded runs', async () => {
      restMode = 'forbidden'
      await makeDetecting().materialize()
      restMode = 'ok'
      requests = []
      const tarballs = await makeDetecting().materialize()
      expect(tarballs.map(t => t.name)).toEqual(['bar'])
    })

    it('uses the public registry diff when the fallback is opted into', async () => {
      restMode = 'forbidden'
      const tarballs = await makeDetecting([], { detectionFallback: 'public-registry' }).materialize()
      // bar is missing from /public/ (404 => embed), pub-pkg matches.
      expect(tarballs.map(t => t.name)).toEqual(['bar'])
      expect(requests.map(r => r.url).filter(url => url.startsWith('/public/')).sort())
        .toEqual(['/public/bar', '/public/pub-pkg'])
    })

    it('skips an auto-detected tarball that fails to download instead of failing the run', async () => {
      const workingServer = server.listeners('request')[0] as http.RequestListener
      server.removeAllListeners('request')
      server.on('request', (req, res) => {
        if (req.url!.endsWith('.tgz')) {
          requests.push({ url: req.url!, authorization: req.headers.authorization })
          res.statusCode = 404
          return res.end('gone')
        }
        workingServer(req as never, res as never)
      })

      const tarballs = await makeDetecting().materialize()
      expect(tarballs).toEqual([])
    })

    it('still fails hard when an explicit tarball cannot be downloaded', async () => {
      server.removeAllListeners('request')
      server.on('request', (req, res) => {
        requests.push({ url: req.url!, authorization: req.headers.authorization })
        res.statusCode = 404
        res.end('gone')
      })

      await expect(makeMaterializer(['bar@2.0.0']).materialize())
        .rejects.toThrow(/Failed to download embedded package 'bar@2\.0\.0'/)
    })

    it('ignores cache entries that the lockfile does not vouch for', async () => {
      // Prime the summary cache, then tamper with it: inject a key for a
      // package that is not in the lockfile at all.
      await makeDetecting().materialize()
      const summaryDir = path.join(
        cacheDir, 'embedded-packages', 'detection',
      )
      const [summaryFile] = (await fs.readdir(summaryDir)).filter(name => name.startsWith('summary-'))
      const summaryPath = path.join(summaryDir, summaryFile)
      const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'))
      summary.embedKeys.push('evil-package@6.6.6::sha512-evil')
      await fs.writeFile(summaryPath, JSON.stringify(summary))

      requests = []
      const tarballs = await makeDetecting().materialize()
      expect(tarballs.map(t => t.name)).toEqual(['bar'])
    })

    it('skips detection for unsupported lockfiles instead of failing', async () => {
      const yarnLockfilePath = path.join(workspaceRoot, 'yarn.lock')
      await fs.writeFile(yarnLockfilePath, '')
      const tarballs = await makeDetecting([], { lockfilePath: yarnLockfilePath }).materialize()
      expect(tarballs).toEqual([])
    })

    it('captures the degraded-run warning with its count and remediation options', async () => {
      restMode = 'forbidden'
      const written = await captureStderr(async () => {
        await makeDetecting().materialize()
      })
      const warning = written.find(line => line.includes('could not determine'))
      expect(warning).toBeDefined()
      expect(warning).toContain('2 package(s)')
      expect(warning).toContain('checks.embeddedPackages')
      expect(warning).toContain('--no-detect-embedded-packages')
    })

    it('detects across npm package-lock.json lockfiles', async () => {
      const npmLockfilePath = await writeNpmLockfile({
        'bar': barLockEntry(),
        'pub-pkg': {
          version: '1.2.3',
          resolved: 'https://registry.npmjs.org/pub-pkg/-/pub-pkg-1.2.3.tgz',
          integrity: pubIntegrity,
        },
      })
      const tarballs = await makeDetecting([], { lockfilePath: npmLockfilePath }).materialize()
      // bar's recorded source is the private registry and it is hosted
      // there; pub-pkg's public resolved URL proves it public with zero
      // lookups.
      expect(tarballs.map(t => `${t.name}@${t.version}`)).toEqual(['bar@2.0.0'])
    })

    it('isolates registry groups: one broken registry does not stop another from deciding', async () => {
      // bar's recorded source is the working Nexus-shaped registry;
      // odd-pkg's recorded source is a Nexus-shaped URL on an unreachable
      // instance, forming a second group that degrades on its own.
      const npmLockfilePath = await writeNpmLockfile({
        'bar': barLockEntry(),
        'odd-pkg': {
          version: '1.0.0',
          resolved: 'http://127.0.0.1:1/repository/npm-x/odd-pkg/-/odd-pkg-1.0.0.tgz',
          integrity: pubIntegrity,
        },
      })
      const tarballs = await makeDetecting([], { lockfilePath: npmLockfilePath }).materialize()
      expect(tarballs.map(t => t.name)).toEqual(['bar'])
    })

    it('embeds a same-origin odd-shaped source when the instance hosts it, and caches', async () => {
      // odd-pkg's recorded source is not Nexus-shaped but shares the
      // configured registry's origin: the conservative fallback may prove
      // it private (hosted => embed). bar and odd-pkg are both hosted, so
      // nothing is skipped and the summary caches.
      const npmLockfilePath = await writeNpmLockfile({
        'bar': barLockEntry(),
        'odd-pkg': {
          version: '1.0.0',
          resolved: `${serverUrl}npm/odd-pkg/-/odd-pkg-1.0.0.tgz`,
          integrity: barIntegrity,
        },
      })
      const tarballs1 = await makeDetecting([], { lockfilePath: npmLockfilePath }).materialize()
      expect(tarballs1.map(t => t.name).sort()).toEqual(['bar', 'odd-pkg'])
      // Both groups (bar authoritative, odd-pkg conservative) target one
      // instance with identical credentials, so the hosted inventory is
      // fetched once.
      expect(requests.map(r => r.url).filter(url => url.startsWith('/service/rest/v1/components')))
        .toHaveLength(1)
      requests = []
      // Cached summary => zero requests on the second run proves the first
      // run was not degraded.
      const tarballs2 = await makeDetecting([], { lockfilePath: npmLockfilePath }).materialize()
      expect(tarballs2.map(t => t.name).sort()).toEqual(['bar', 'odd-pkg'])
      expect(requests).toHaveLength(0)
    })

    it('never mints a public verdict from the conservative same-origin fallback', async () => {
      // not-hosted-pkg shares the configured registry's origin but is not
      // in its hosted inventory: its availability is unknown, so it is
      // skipped with a warning (degraded, not cached) instead of being
      // silently declared public.
      const npmLockfilePath = await writeNpmLockfile({
        'not-hosted-pkg': {
          version: '1.0.0',
          resolved: `${serverUrl}npm/not-hosted-pkg/-/not-hosted-pkg-1.0.0.tgz`,
          integrity: pubIntegrity,
        },
      })
      let tarballs: Awaited<ReturnType<EmbeddedPackagesMaterializer['materialize']>> = []
      const written = await captureStderr(async () => {
        tarballs = await makeDetecting([], { lockfilePath: npmLockfilePath }).materialize()
      })
      expect(tarballs).toEqual([])
      // The headline privacy property of the no-opt-in branch: the
      // undecided name is never sent to the public registry.
      expect(requests.some(r => r.url.startsWith('/public/'))).toBe(false)
      // The REST API answered fine, so the remedy list must not send the
      // user chasing REST permissions — but still offer what helps.
      const warning = written.find(line => line.includes('could not determine'))
      expect(warning).toBeDefined()
      expect(warning).not.toContain('REST API')
      expect(warning).toContain('checks.embeddedPackages')
      expect(warning).toContain('detectEmbeddedPackagesFallback')
      requests = []
      // Degraded => not cached => the next run interrogates again.
      await makeDetecting([], { lockfilePath: npmLockfilePath }).materialize()
      expect(requests.length).toBeGreaterThan(0)
    })

    it('memoizes instance data across groups while running the visibility guard per group', async () => {
      // Two groups on the same instance: bar from npm-group (visible),
      // hidden-pkg from npm-hidden (not in the repository listing). The
      // second group degrades on its own visibility guard while the first
      // decides — and the repository listing is fetched only once.
      const npmLockfilePath = await writeNpmLockfile({
        'bar': barLockEntry(),
        'hidden-pkg': {
          version: '1.0.0',
          resolved: `${serverUrl}repository/npm-hidden/hidden-pkg/-/hidden-pkg-1.0.0.tgz`,
          integrity: pubIntegrity,
        },
      })
      const tarballs = await makeDetecting([], { lockfilePath: npmLockfilePath }).materialize()
      expect(tarballs.map(t => t.name)).toEqual(['bar'])
      expect(requests.map(r => r.url).filter(url => url === '/service/rest/v1/repositories'))
        .toHaveLength(1)
    })

    it('does not share instance data between groups with different credentials', async () => {
      // Two Nexus-shaped repos on one instance, each with its own token.
      // The repository listing is permission-filtered per token, so the
      // memoized listing and inventory must not bleed between the groups:
      // sharing token A's listing with the npm-b group would hide npm-b's
      // repository and silently drop pkg-b.
      const port = (server.address() as AddressInfo).port
      server.removeAllListeners('request')
      server.on('request', (req, res) => {
        requests.push({ url: req.url!, authorization: req.headers.authorization })
        const repo = req.headers.authorization === 'Bearer token-a'
          ? 'npm-a'
          : req.headers.authorization === 'Bearer token-b' ? 'npm-b' : undefined
        const respond = (body: unknown) => {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.url!.endsWith('.tgz')) {
          return res.end(barTarball)
        }
        if (repo === undefined) {
          res.statusCode = 403
          return res.end('forbidden')
        }
        if (req.url === '/service/rest/v1/repositories') {
          return respond([{ name: repo, format: 'npm', type: 'hosted' }])
        }
        if (req.url!.startsWith(`/service/rest/v1/components?repository=${repo}`)) {
          const name = repo === 'npm-a' ? 'pkg-a' : 'pkg-b'
          return respond({
            items: [{
              repository: repo,
              format: 'npm',
              group: null,
              name,
              version: '1.0.0',
              assets: [{ checksum: {}, npm: { name, version: '1.0.0' } }],
            }],
            continuationToken: null,
          })
        }
        res.statusCode = 404
        res.end('not found')
      })
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        `registry=${serverUrl}repository/npm-a/`,
        `//127.0.0.1:${port}/repository/npm-a/:_authToken=token-a`,
        `//127.0.0.1:${port}/repository/npm-b/:_authToken=token-b`,
      ].join('\n'))
      const npmLockfilePath = await writeNpmLockfile({
        'pkg-a': {
          version: '1.0.0',
          resolved: `${serverUrl}repository/npm-a/pkg-a/-/pkg-a-1.0.0.tgz`,
          integrity: barIntegrity,
        },
        'pkg-b': {
          version: '1.0.0',
          resolved: `${serverUrl}repository/npm-b/pkg-b/-/pkg-b-1.0.0.tgz`,
          integrity: barIntegrity,
        },
      })
      const tarballs = await makeDetecting([], { lockfilePath: npmLockfilePath }).materialize()
      expect(tarballs.map(t => t.name).sort()).toEqual(['pkg-a', 'pkg-b'])
      // Each group interrogates with its own credentials.
      expect(requests.map(r => r.url).filter(url => url === '/service/rest/v1/repositories'))
        .toHaveLength(2)
      expect(requests.map(r => r.url).filter(url => url.startsWith('/service/rest/v1/components')))
        .toHaveLength(2)
    })

    it('does not let a version-pinned spec silence degradation for other versions of the name', async () => {
      // Both odd-pkg versions are undecidable (the REST API answers 403).
      // The pinned spec covers only 1.0.0; 2.0.0 is neither materialized
      // nor decided, so the run must stay degraded (uncached) and warn.
      restMode = 'forbidden'
      const npmLockfilePath = await writeNpmLockfile({
        'odd-pkg': {
          version: '1.0.0',
          resolved: `${registryUrl}odd-pkg/-/odd-pkg-1.0.0.tgz`,
          integrity: barIntegrity,
        },
        'x/node_modules/odd-pkg': {
          version: '2.0.0',
          resolved: `${registryUrl}odd-pkg/-/odd-pkg-2.0.0.tgz`,
          integrity: barIntegrity,
        },
      })
      await makeDetecting(['odd-pkg@1.0.0'], { lockfilePath: npmLockfilePath }).materialize()
      requests = []
      // Degraded => not cached => the next run interrogates again.
      await makeDetecting(['odd-pkg@1.0.0'], { lockfilePath: npmLockfilePath }).materialize()
      expect(requests.some(r => r.url.startsWith('/service/rest/v1/'))).toBe(true)
    })

    it('trusts a public-registry proof for conservative same-origin entries when opted in', async () => {
      // pub-pkg's recorded source shares the configured registry's origin
      // but is not hosted on it. The hosted inventory's silence leaves it
      // undecided, but the opted-in public-registry diff settles it with
      // an integrity proof: no degradation, and the summary caches.
      const npmLockfilePath = await writeNpmLockfile({
        'bar': barLockEntry(),
        'pub-pkg': {
          version: '1.2.3',
          resolved: `${serverUrl}npm/pub-pkg/-/pub-pkg-1.2.3.tgz`,
          integrity: pubIntegrity,
        },
      })
      const detectOpts = { lockfilePath: npmLockfilePath, detectionFallback: 'public-registry' }
      const tarballs1 = await makeDetecting([], detectOpts).materialize()
      expect(tarballs1.map(t => t.name)).toEqual(['bar'])
      expect(requests.map(r => r.url).filter(url => url.startsWith('/public/'))).toEqual(['/public/pub-pkg'])
      requests = []
      // Zero requests on the second run proves the first run was not
      // degraded and its summary was cached.
      const tarballs2 = await makeDetecting([], detectOpts).materialize()
      expect(tarballs2.map(t => t.name)).toEqual(['bar'])
      expect(requests).toHaveLength(0)
    })

    it('re-detects when the explicit list changes (explicit specs are part of the summary key)', async () => {
      // Prime the cache with no explicit specs.
      await makeDetecting().materialize()
      requests = []
      await makeDetecting().materialize()
      expect(requests).toHaveLength(0)
      // A changed explicit list must not reuse the summary.
      await makeDetecting(['bar@2.0.0']).materialize()
      expect(requests.length).toBeGreaterThan(0)
    })

    it('degrades for foreign-origin undecidable sources unless they are listed explicitly', async () => {
      // A second server on its own origin plays the foreign registry the
      // artifact was recorded from (non-Nexus-shaped URL layout).
      const foreignServer = http.createServer((req, res) => res.end(barTarball))
      await new Promise<void>(resolve => foreignServer.listen(0, '127.0.0.1', resolve))
      const foreignPort = (foreignServer.address() as AddressInfo).port
      try {
        const npmLockfilePath = await writeNpmLockfile({
          'bar': barLockEntry(),
          'odd-pkg': {
            version: '1.0.0',
            resolved: `http://127.0.0.1:${foreignPort}/npm/odd-pkg/-/odd-pkg-1.0.0.tgz`,
            integrity: barIntegrity,
          },
        })

        // Undecidable foreign origin: the run degrades, so nothing is
        // cached and the second run interrogates again.
        await makeDetecting([], { lockfilePath: npmLockfilePath }).materialize()
        requests = []
        await makeDetecting([], { lockfilePath: npmLockfilePath }).materialize()
        expect(requests.length).toBeGreaterThan(0)

        // Listing the undecidable package explicitly covers it: the run no
        // longer counts as degraded and the summary caches.
        await makeDetecting(['odd-pkg@1.0.0'], { lockfilePath: npmLockfilePath }).materialize()
        requests = []
        const tarballs = await makeDetecting(['odd-pkg@1.0.0'], { lockfilePath: npmLockfilePath })
          .materialize()
        expect(tarballs.map(t => t.name).sort()).toEqual(['bar', 'odd-pkg'])
        expect(requests).toHaveLength(0)
      } finally {
        await new Promise<void>((resolve, reject) => foreignServer.close(err => err ? reject(err) : resolve()))
      }
    })

    it('reaches the opted-in fallback when credential expansion fails', async () => {
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        `registry=${registryUrl}`,
        `//127.0.0.1:${(server.address() as AddressInfo).port}/:_authToken=\${RED862_UNSET_TOKEN}`,
      ].join('\n'))
      let tarballs: Awaited<ReturnType<EmbeddedPackagesMaterializer['materialize']>> = []
      const written = await captureStderr(async () => {
        tarballs = await makeDetecting([], { detectionFallback: 'public-registry' }).materialize()
      })
      // The registry API tier cannot even resolve credentials, but the
      // opt-in public diff is still reached and decides (bar 404s publicly
      // => embed). The download of bar then fails soft on the same broken
      // credential, so nothing materializes — the assertion is about the
      // fallback being reachable.
      expect(requests.map(r => r.url).filter(url => url.startsWith('/public/')).sort())
        .toEqual(['/public/bar', '/public/pub-pkg'])
      expect(tarballs).toEqual([])
      // A broken credential mapping is a configuration problem too, and
      // must be reported as one, not silently papered over.
      expect(written.find(line => line.includes('configuration problem'))).toContain('RED862_UNSET_TOKEN')
    })

    it('does not send explicitly listed names to the public registry fallback', async () => {
      // bar is explicitly listed, so its verdict would be discarded at
      // rehydration anyway — its name must not reach the public registry
      // even with the fallback opted in. Only pub-pkg is diffed.
      restMode = 'forbidden'
      const tarballs = await makeDetecting(['bar'], { detectionFallback: 'public-registry' }).materialize()
      expect(tarballs.map(t => t.name)).toEqual(['bar'])
      expect(requests.map(r => r.url).filter(url => url.startsWith('/public/'))).toEqual(['/public/pub-pkg'])
    })

    it('applies cached per-entry proofs even when the public fallback is not opted in', async () => {
      // Run 1 (opted in) proves bar private and caches the verdicts. Run 2
      // has the fallback off and a changed lockfile (summary miss): the
      // cached proofs are a pure disk read, so bar is still embedded and
      // pub-pkg stays excluded while only the new unknown entry degrades —
      // and nothing is sent to /public/. This is the documented contract:
      // verdicts continue to apply after opting back out.
      restMode = 'forbidden'
      await makeDetecting([], { detectionFallback: 'public-registry' }).materialize()
      requests = []
      await fs.writeFile(lockfilePath, `${detectLockfile()}  baz@3.0.0:
    resolution: {integrity: ${barIntegrity}}
`)
      const tarballs = await makeDetecting().materialize()
      expect(tarballs.map(t => t.name)).toEqual(['bar'])
      expect(requests.some(r => r.url.startsWith('/public/'))).toBe(false)
    })

    it('embeds an explicitly listed scope-mapped package exactly once, without warnings', async () => {
      // The explicit spec covers @acme/foo's only lockfile version, so
      // detection is never even consulted about it — it materializes once
      // via the explicit path, with no pin-blocked warning and no
      // registry API traffic.
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), [
        `registry=${registryUrl}`,
        `@acme:registry=${registryUrl}`,
      ].join('\n'))
      await fs.writeFile(lockfilePath, `
lockfileVersion: '9.0'
packages:
  '@acme/foo@1.2.3':
    resolution: {integrity: ${barIntegrity}}
`)
      let tarballs: Awaited<ReturnType<EmbeddedPackagesMaterializer['materialize']>> = []
      const written = await captureStderr(async () => {
        tarballs = await makeDetecting(['@acme/foo']).materialize()
      })
      expect(tarballs.map(t => `${t.name}@${t.version}`)).toEqual(['@acme/foo@1.2.3'])
      expect(tarballs[0].detected).toBeUndefined()
      expect(written.filter(line => line.startsWith('Warning:'))).toEqual([])
      expect(requests.some(r => r.url.startsWith('/service/'))).toBe(false)
    })

    it('persists partial public-diff verdicts when a lookup fails, and resumes where it left off', async () => {
      restMode = 'forbidden'
      publicBarMode = 'error'
      // Run 1: pub-pkg's packument succeeds (an integrity proof) while
      // bar's lookup fails; the partial proof must be persisted.
      await makeDetecting([], { detectionFallback: 'public-registry' }).materialize()
      expect(requests.map(r => r.url).filter(url => url.startsWith('/public/')).sort())
        .toEqual(['/public/bar', '/public/pub-pkg'])
      requests = []
      // Run 2: only bar — the still-unknown name — is transmitted again.
      await makeDetecting([], { detectionFallback: 'public-registry' }).materialize()
      expect(requests.map(r => r.url).filter(url => url.startsWith('/public/'))).toEqual(['/public/bar'])
    })

    it('does not hang when a lookup fails with more names than the detection concurrency', async () => {
      // Regression guard: aborting the diff by clearing the task queue
      // would leave the cleared tasks' promises unsettled and hang the
      // run forever once the number of unique names exceeds the queue
      // concurrency (10).
      restMode = 'forbidden'
      publicBarMode = 'error'
      const many = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`pkg-${i}`, {
        version: '1.0.0',
        resolved: `${registryUrl}pkg-${i}/-/pkg-${i}-1.0.0.tgz`,
        integrity: barIntegrity,
      }]))
      const npmLockfilePath = await writeNpmLockfile({ ...many, bar: barLockEntry() })
      const tarballs = await makeDetecting([], { lockfilePath: npmLockfilePath, detectionFallback: 'public-registry' })
        .materialize()
      // bar's lookup fails (degrading the run); every pkg-N task starts
      // before bar's (bar is last in the lockfile), so all 15 get their
      // 404 => embed verdict and materialize.
      expect(tarballs.map(t => t.name).sort()).toEqual(
        Array.from({ length: 15 }, (_, i) => `pkg-${i}`).sort())
    })

    it('reaches the opted-in fallback when the registry mapping references an unset variable', async () => {
      // A configuration error must not bypass the opted-in diff — it can
      // decide the packages without the configured registry. (Downloads of
      // the proven-private entries then fail soft on the same broken
      // configuration, so nothing materializes.)
      await fs.writeFile(path.join(workspaceRoot, '.npmrc'), 'registry=${RED862_UNSET_REGISTRY}\n')
      let tarballs: Awaited<ReturnType<EmbeddedPackagesMaterializer['materialize']>> = []
      const written = await captureStderr(async () => {
        tarballs = await makeDetecting([], { detectionFallback: 'public-registry' }).materialize()
      })
      expect(requests.map(r => r.url).filter(url => url.startsWith('/public/')).sort())
        .toEqual(['/public/bar', '/public/pub-pkg'])
      expect(tarballs).toEqual([])
      // The fallback deciding the packages must not hide the underlying
      // configuration problem.
      const configWarning = written.find(line => line.includes('configuration problem'))
      expect(configWarning).toBeDefined()
      expect(configWarning).toContain('RED862_UNSET_REGISTRY')
      // The problem persists, so the warning must recur on the next run —
      // served entirely from the verdict cache, with zero network.
      requests = []
      const written2 = await captureStderr(async () => {
        await makeDetecting([], { detectionFallback: 'public-registry' }).materialize()
      })
      expect(written2.find(line => line.includes('configuration problem'))).toContain('RED862_UNSET_REGISTRY')
      expect(requests).toHaveLength(0)
    })

    it('returns nothing, silently, for an options shape without workspace root and lockfile', async () => {
      const written = await captureStderr(async () => {
        const materializer = makeMaterializer([], {
          detect: true,
          workspaceRoot: undefined,
          lockfilePath: undefined,
        })
        await expect(materializer.materialize()).resolves.toEqual([])
      })
      expect(written).toEqual([])
    })

    it('announces auto-embedded packages on an informational line, not a warning', async () => {
      const written = await captureStderr(async () => {
        await makeDetecting().materialize()
      })
      const announcement = written.find(line => line.includes('auto-detected private package'))
      expect(announcement).toBeDefined()
      expect(announcement).toContain('bar@2.0.0')
      expect(announcement).toContain('--no-detect-embedded-packages')
      expect(announcement!.startsWith('Warning:')).toBe(false)
    })

    it('does not run detection when disabled', async () => {
      const tarballs = await makeMaterializer(['bar@2.0.0'], { publicRegistryUrl: `${serverUrl}public/` })
        .materialize()
      expect(tarballs.map(t => t.name)).toEqual(['bar'])
      expect(requests.map(r => r.url).some(url => url.startsWith('/public/') || url.startsWith('/service/'))).toBe(false)
    })
  })
})
