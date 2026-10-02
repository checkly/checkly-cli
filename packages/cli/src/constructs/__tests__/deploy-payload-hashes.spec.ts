import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rest/api', () => ({
  checklyStorage: { upload: vi.fn(), uploadCodeBundle: vi.fn() },
}))

import { checklyStorage } from '../../rest/api.js'
import { Bundler } from '../../services/check-parser/bundler.js'
import { detectSnapshots, uploadSnapshots } from '../../services/snapshot-service.js'
import { BrowserCheck } from '../browser-check.js'
import { BrowserCheckBundle } from '../browser-check-bundle.js'
import { PlaywrightCheck } from '../playwright-check.js'
import { PlaywrightCheckBundle } from '../playwright-check-bundle.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

/**
 * The content hashes the deploy payload carries for everything it uploads: one
 * per visual snapshot and one for the Playwright code bundle. Both are
 * computable before anything is uploaded, which is what lets `checkly deploy`
 * ask Checkly what a deploy would change without uploading first — so both
 * have to be in the synthesized payload at that point, when the storage keys
 * are not.
 */

const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex')

describe('snapshot content hashes', () => {
  let basePath: string

  beforeEach(async () => {
    basePath = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'hashes-')))
    Session.reset()
    Session.basePath = basePath
    Session.project = new Project('project-id', { name: 'Test Project' })
  })

  afterEach(async () => {
    Session.reset()
    await fs.rm(basePath, { recursive: true, force: true })
  })

  async function writeSnapshot (name: string, content: string): Promise<string> {
    const dir = path.join(basePath, 'tests', 'home.spec.ts-snapshots')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, name), content)
    return content
  }

  it('hashes each detected snapshot file', async () => {
    const first = await writeSnapshot('home.png', 'first-image')
    const second = await writeSnapshot('about.png', 'second-image')

    const snapshots = await detectSnapshots(basePath, path.join(basePath, 'tests', 'home.spec.ts'))

    expect(snapshots).toHaveLength(2)
    expect(snapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'tests/home.spec.ts-snapshots/home.png', sha256: sha256(first) }),
      expect.objectContaining({ path: 'tests/home.spec.ts-snapshots/about.png', sha256: sha256(second) }),
    ]))
  })

  it('reports a snapshot by hash before the upload and by hash and key after it', async () => {
    const content = await writeSnapshot('home.png', 'an-image')
    const rawSnapshots = await detectSnapshots(basePath, path.join(basePath, 'tests', 'home.spec.ts'))
    const check = new BrowserCheck('browser-check', {
      name: 'Browser check',
      code: { content: 'console.log("x")' },
    })
    const bundle = new BrowserCheckBundle(check, { script: 'console.log("x")', rawSnapshots })

    // What a preview sees: no storage key exists yet, and the hash is what
    // describes the file.
    expect(bundle.synthesize().snapshots).toEqual([
      { path: 'tests/home.spec.ts-snapshots/home.png', sha256: sha256(content) },
    ])

    vi.mocked(checklyStorage.upload).mockResolvedValue({ data: { key: 'checks/home.png' } } as never)
    bundle.snapshots = await uploadSnapshots(bundle.rawSnapshots)

    // What the deploy sends: the key the upload produced, and the same hash.
    expect(bundle.synthesize().snapshots).toEqual([
      { path: 'tests/home.spec.ts-snapshots/home.png', key: 'checks/home.png', sha256: sha256(content) },
    ])
  })

  it('leaves an inline-script check without snapshots', () => {
    const check = new BrowserCheck('browser-check', {
      name: 'Browser check',
      code: { content: 'console.log("x")' },
    })
    const bundle = new BrowserCheckBundle(check, { script: 'console.log("x")' })

    expect(bundle.synthesize().snapshots).toBeUndefined()
  })
})

describe('code bundle content hash', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-')))
    Session.reset()
    Session.project = new Project('project-id', { name: 'Test Project' })
  })

  afterEach(async () => {
    Session.reset()
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  function playwrightBundle (bundler: Bundler) {
    // The construct resolves its config path against the file that declares
    // it, as it does when a check file is loaded.
    Session.checkFileAbsolutePath = path.join(tempDir, 'suite.check.ts')
    const check = new PlaywrightCheck('suite', {
      name: 'Suite',
      playwrightConfigPath: 'playwright.config.ts',
      logicalId: 'suite',
    })
    return new PlaywrightCheckBundle(check, {
      codeBundlePath: bundler.marker,
      codeBundleSha256: bundler.codeBundleSha256,
      testCommand: 'npx playwright test',
    })
  }

  it('carries the archive\'s hash once the bundle has been finalized', async () => {
    const sourceFile = path.join(tempDir, 'spec.ts')
    await fs.writeFile(sourceFile, 'export const x = 1')

    const bundler = await Bundler.create({ cacheHash: 'cache-hash', stripPrefix: tempDir })
    bundler.registerFiles({ filePath: sourceFile, physical: true })
    const bundle = playwrightBundle(bundler)

    // The archive does not exist yet, so there is no hash to claim: the key is
    // simply absent from the payload rather than present and wrong.
    expect(JSON.parse(JSON.stringify(bundle.synthesize()))).not.toHaveProperty('codeBundleSha256')

    const archive = await bundler.finalize()
    // What `checkly deploy` does between finalizing and previewing: the
    // payload points at the archive on disk, since nothing is uploaded yet.
    bundler.updateMarker(archive.archiveFile)

    const payload = JSON.parse(JSON.stringify(bundle.synthesize()))
    expect(payload.codeBundleSha256).toBe(sha256(await fs.readFile(archive.archiveFile)))
    expect(payload.codeBundleSha256).toBe(archive.sha256)
    expect(payload.codeBundlePath).toBe(archive.archiveFile)
  })

  it('hashes the same content to the same value whatever the timestamps are', async () => {
    // The hash has to describe the content alone: a file's mtime (a CI pipeline
    // clones fresh every run, so every mtime is the checkout time) and the
    // clock a generated entry would otherwise be stamped with must not reach
    // it, or every deploy reports every Playwright suite as changed.
    // Only the clock is faked, so an entry archiver would timestamp itself gets
    // a different one per iteration; the archive's own streams keep real timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    const hashes: string[] = []
    for (const [attempt, mtime] of [['first', new Date('2026-01-01T00:00:00Z')],
      ['second', new Date('2026-06-15T12:34:56Z')]] as const) {
      vi.setSystemTime(mtime)
      const dir = await fs.mkdtemp(path.join(tempDir, `${attempt}-`))
      const sourceFile = path.join(dir, 'spec.ts')
      await fs.writeFile(sourceFile, 'export const x = 1')
      await fs.utimes(sourceFile, mtime, mtime)
      const bundler = await Bundler.create({ cacheHash: 'cache-hash', stripPrefix: dir })
      bundler.registerFiles(
        { filePath: sourceFile, physical: true },
        { filePath: path.join(dir, 'package.json'), physical: false, content: '{"name":"generated"}' },
        // A workspace bundle is a symlink farm, and those entries carry a
        // timestamp of their own.
        { filePath: path.join(dir, 'node_modules', 'pkg'), physical: true, symlinkTarget: '../packages/pkg' },
      )
      hashes.push((await bundler.finalize()).sha256)
    }
    vi.useRealTimers()

    expect(hashes[0]).toBe(hashes[1])
  })

  it('sends the archive\'s hash with the upload, so the stored object can be matched to it', async () => {
    const sourceFile = path.join(tempDir, 'spec.ts')
    await fs.writeFile(sourceFile, 'export const x = 1')
    const bundler = await Bundler.create({ cacheHash: 'cache-hash', stripPrefix: tempDir })
    bundler.registerFiles({ filePath: sourceFile, physical: true })
    const archive = await bundler.finalize()
    vi.mocked(checklyStorage.uploadCodeBundle).mockResolvedValue({ data: { key: 'bundles/x.tar.gz' } } as never)

    await archive.store()

    expect(checklyStorage.uploadCodeBundle).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Number),
      archive.sha256,
    )
  })

  it('changes when the bundled content changes', async () => {
    const hashes: string[] = []
    for (const content of ['export const x = 1', 'export const x = 2']) {
      const dir = await fs.mkdtemp(path.join(tempDir, 'case-'))
      const sourceFile = path.join(dir, 'spec.ts')
      await fs.writeFile(sourceFile, content)
      const bundler = await Bundler.create({ cacheHash: 'cache-hash', stripPrefix: dir })
      bundler.registerFiles({ filePath: sourceFile, physical: true })
      const archive = await bundler.finalize()
      hashes.push(archive.sha256)
    }

    expect(hashes[0]).not.toBe(hashes[1])
  })
})
