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

    it('reuses the CLI cache instead of downloading again', async () => {
      await makeMaterializer(['bar@2.0.0']).materialize()
      expect(requests).toHaveLength(1)
      await makeMaterializer(['bar@2.0.0']).materialize()
      expect(requests).toHaveLength(1)
    })

    it('uses npm cacache content without hitting the network', async () => {
      const hex = createHash('sha512').update(barTarball).digest('hex')
      const contentPath = path.join(
        homedir, '.npm', '_cacache', 'content-v2', 'sha512',
        hex.slice(0, 2), hex.slice(2, 4), hex.slice(4),
      )
      await fs.mkdir(path.dirname(contentPath), { recursive: true })
      await fs.writeFile(contentPath, barTarball)

      const tarballs = await makeMaterializer(['bar@2.0.0']).materialize()
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
})
