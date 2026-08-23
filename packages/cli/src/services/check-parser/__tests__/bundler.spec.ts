import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { list } from 'tar'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BundleArchive, BundleTooLargeError, Bundler, FinalizedBundleArchive } from '../bundler.js'
import { composeWorkspaceCacheHash, loadWorkspaceCacheHashInputs } from '../cache-hash.js'
import { npmPackageManager, PNpmDetector, Runnable, YarnDetector } from '../package-files/package-manager.js'
import { Package, Workspace } from '../package-files/workspace.js'
import { Err, Ok } from '../package-files/result.js'
import { EmbeddedPackageError, EmbeddedPackagesMaterializer } from '../../embedded-packages/materializer.js'
import { TarballCache } from '../../embedded-packages/cache.js'
import { PayloadTooLargeError } from '../../../rest/errors.js'

const uploadCodeBundle = vi.hoisted(() => vi.fn())

vi.mock('../../../rest/api.js', () => ({
  checklyStorage: {
    uploadCodeBundle,
  },
}))

describe('BundleTooLargeError', () => {
  it('names both sizes when the server reports its limit', () => {
    const err = new BundleTooLargeError({
      sizeBytes: 44 * 1048576,
      maxBytes: 30 * 1048576,
    })
    expect(err.message).toContain('the compressed bundle is 44 MB')
    expect(err.message).toContain('the Checkly API accepts at most 30 MB')
    expect(err.sizeBytes).toBe(44 * 1048576)
    expect(err.maxBytes).toBe(30 * 1048576)
  })

  it('cannot render two equal figures for a bundle just over the limit', () => {
    const err = new BundleTooLargeError({
      sizeBytes: 30 * 1048576 + 1,
      maxBytes: 30 * 1048576,
    })
    expect(err.message).toContain('the compressed bundle is 30.1 MB')
    expect(err.message).toContain('the Checkly API accepts at most 30 MB')
  })

  it('degrades gracefully when the limit is unknown', () => {
    const err = new BundleTooLargeError({
      sizeBytes: 45613957,
    })
    expect(err.message).toContain('the compressed bundle is 43.6 MB')
    expect(err.message).toContain('which exceeds what the upload endpoint accepts')
  })

  it('does not attribute a limit that would render as 0 MB', () => {
    const err = new BundleTooLargeError({
      sizeBytes: 1048576,
      maxBytes: 65536,
    })
    expect(err.message).not.toContain('0 MB')
    expect(err.message).toContain('which exceeds what the upload endpoint accepts')
  })

  it('suggests embedding fewer packages only when the bundle embeds some', () => {
    const without = new BundleTooLargeError({ sizeBytes: 1048576 })
    expect(without.message).not.toContain('bundle.packages.embed')

    const withPackages = new BundleTooLargeError({ sizeBytes: 1048576, containsEmbeddedPackages: true })
    expect(withPackages.message).toContain(`embedding fewer private packages ('bundle.packages.embed')`)
  })
})

describe('FinalizedBundleArchive.store()', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-bundler-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
    uploadCodeBundle.mockReset()
  })

  function reject413 (message: string) {
    uploadCodeBundle.mockRejectedValue(new PayloadTooLargeError({
      statusCode: 413,
      error: 'Request Entity Too Large',
      message,
    }))
  }

  it('turns a 413 rejection into a BundleTooLargeError naming both sizes', async () => {
    const archiveFile = path.join(dir, 'playwright-project.tar.gz')
    await fs.writeFile(archiveFile, Buffer.alloc(2 * 1048576))

    reject413('Payload content length greater than maximum allowed: 1048576')

    const archive = await FinalizedBundleArchive.create({ archiveFile })
    const failure = await archive.store().catch(err => err)
    expect(failure).toBeInstanceOf(BundleTooLargeError)
    expect(failure.message).toMatch(
      /code bundle is too large to upload: the compressed bundle is 2 MB, but the Checkly API accepts at most 1 MB/,
    )
    expect(failure.message).not.toContain('bundle.packages.embed')
  })

  it('handles a 413 response that does not name the limit', async () => {
    const archiveFile = path.join(dir, 'playwright-project.tar.gz')
    await fs.writeFile(archiveFile, Buffer.alloc(1048576))

    reject413('Request Entity Too Large')

    const archive = await FinalizedBundleArchive.create({ archiveFile })
    await expect(archive.store()).rejects.toThrow('which exceeds what the upload endpoint accepts')
  })

  it('rethrows other upload failures untouched', async () => {
    const archiveFile = path.join(dir, 'playwright-project.tar.gz')
    await fs.writeFile(archiveFile, 'data')

    uploadCodeBundle.mockRejectedValue(new Error('boom'))

    const archive = await FinalizedBundleArchive.create({ archiveFile })
    await expect(archive.store()).rejects.toThrow('boom')
  })
})

describe('BundleArchive embedded package detection', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-bundler-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
    uploadCodeBundle.mockReset()
  })

  it('flags archives containing embedded package tarballs so a 413 mentions them', async () => {
    const tarballFile = path.join(dir, 'acme+foo@1.0.0.tgz')
    await fs.writeFile(tarballFile, 'tarball-bytes')

    const bundle = await BundleArchive.create({ tempDir: path.join(dir, 'archive') })
    await bundle.add({
      physical: true,
      filePath: tarballFile,
      // The shape the embedded-packages materializer produces: a physical
      // file with an explicit archive path at the bundle contract location.
      archivePath: '.checkly/embedded-packages/acme+foo@1.0.0.tgz',
    })
    const archive = await bundle.finalize()

    uploadCodeBundle.mockRejectedValue(new PayloadTooLargeError({
      statusCode: 413,
      error: 'Request Entity Too Large',
      message: 'Payload content length greater than maximum allowed: 31457280',
    }))

    await expect(archive.store()).rejects.toThrow(`'bundle.packages.embed'`)
  })
})

describe('Bundler.createForWorkspace', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-bundler-')))
    await fs.writeFile(path.join(dir, 'package.json'), '{"name":"fixture-root"}\n')
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('mixes the embedded packages materializer plan into the cache hash', async () => {
    const lockfilePath = path.join(dir, 'pnpm-lock.yaml')
    await fs.writeFile(lockfilePath, [
      `lockfileVersion: '9.0'`,
      `packages:`,
      `  '@acme/foo@1.2.3':`,
      `    resolution: {integrity: sha512-aaa}`,
      ``,
    ].join('\n'))
    const workspace = new Workspace({
      root: new Package({ name: 'fixture-root', path: dir }),
      packages: [],
      lockfile: Ok(lockfilePath),
      configFile: Err(new Error('no config file')),
    })

    const without = await Bundler.createForWorkspace(workspace, {
      packageManager: npmPackageManager,
    })
    const withFoo = await Bundler.createForWorkspace(workspace, {
      packageManager: npmPackageManager,
      embeddedPackagesMaterializer: new EmbeddedPackagesMaterializer({
        specs: ['@acme/foo'],
        lockfilePath,
        workspaceRoot: dir,
      }),
    })

    expect(without.cacheHash.toJSON()).not.toBe(withFoo.cacheHash.toJSON())
  })
})

describe('Bundler.finalize() lockfile prune reporting', () => {
  let dir: string
  let stderrWrites: string[]

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-bundler-')))
    await fs.mkdir(path.join(dir, 'packages/m'), { recursive: true })
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'fixture-root',
      private: true,
      dependencies: { '@fixture/m': 'workspace:*' },
    }))
    await fs.writeFile(path.join(dir, 'packages/m/package.json'), JSON.stringify({
      name: '@fixture/m',
      version: '1.0.0',
    }))
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\n`)
    stderrWrites = []
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
      // The debug library also writes to stderr when DEBUG is enabled; only
      // the CLI's own user-facing writes are under test.
      const text = String(chunk)
      if (!text.includes('checkly:cli:')) {
        stderrWrites.push(text)
      }
      return true
    })
    vi.stubEnv('CHECKLY_LOCKFILE_PRUNE', '')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await fs.rm(dir, { recursive: true, force: true })
  })

  const makeWorkspace = () => new Workspace({
    root: new Package({ name: 'fixture-root', path: dir }),
    packages: [new Package({ name: '@fixture/m', path: path.join(dir, 'packages/m'), version: '1.0.0' })],
    lockfile: Ok(path.join(dir, 'pnpm-lock.yaml')),
    configFile: Err(new Error('no config file')),
  })

  it('prints a note when pruning is needed but unavailable', async () => {
    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      // Yarn has no lockfile-only install, so a partial-workspace bundle
      // must surface the unpruned lockfile instead of skipping silently.
      packageManager: new YarnDetector(),
    })
    bundler.registerFiles(
      { filePath: path.join(dir, 'package.json'), physical: true },
      { filePath: path.join(dir, 'pnpm-lock.yaml'), physical: true },
      { filePath: path.join(dir, 'packages/m/package.json'), physical: false, content: '{"name":"@fixture/m","version":"1.0.0"}' },
    )
    await bundler.finalize()

    const output = stderrWrites.join('')
    expect(output).toContain('Note: the bundled lockfile was not pruned')
    expect(output).toContain('CHECKLY_LOCKFILE_PRUNE=0')
  })

  it('stays silent when the bundle contains the full workspace', async () => {
    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      packageManager: new YarnDetector(),
    })
    bundler.registerFiles(
      { filePath: path.join(dir, 'package.json'), physical: true },
      { filePath: path.join(dir, 'pnpm-lock.yaml'), physical: true },
      { filePath: path.join(dir, 'packages/m/package.json'), physical: true },
    )
    await bundler.finalize()

    expect(stderrWrites.join('')).toEqual('')
  })
})

describe('Bundler.finalize() embedded package materialization', () => {
  let dir: string
  let cacheDir: string
  let homeDir: string
  let stderrWrites: string[]

  // Any accidental download attempt must fail deterministically and
  // instantly instead of reaching the public registry.
  const UNREACHABLE_REGISTRY = 'http://127.0.0.1:9/'

  const keptBytes = Buffer.from('kept-tarball-bytes')
  const droppedBytes = Buffer.from('dropped-tarball-bytes')
  const integrityOf = (bytes: Buffer) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  const keptIntegrity = integrityOf(keptBytes)
  const droppedIntegrity = integrityOf(droppedBytes)

  const FAUX_MANIFEST = '{"name":"@fixture/m","version":"1.0.0"}'

  const originalLockfile = () => [
    `lockfileVersion: '9.0'`,
    ``,
    `importers:`,
    ``,
    `  .:`,
    `    dependencies:`,
    `      '@fixture/m':`,
    `        specifier: workspace:*`,
    `        version: link:packages/m`,
    ``,
    `  packages/m:`,
    `    dependencies:`,
    `      '@acme/dropped':`,
    `        specifier: 1.0.0`,
    `        version: 1.0.0`,
    `      '@acme/kept':`,
    `        specifier: 1.0.0`,
    `        version: 1.0.0`,
    ``,
    `packages:`,
    ``,
    `  '@acme/dropped@1.0.0':`,
    `    resolution: {integrity: ${droppedIntegrity}}`,
    ``,
    `  '@acme/kept@1.0.0':`,
    `    resolution: {integrity: ${keptIntegrity}}`,
    ``,
    `snapshots:`,
    ``,
    `  '@acme/dropped@1.0.0': {}`,
    ``,
    `  '@acme/kept@1.0.0': {}`,
    ``,
  ].join('\n')

  // The "regenerated" lockfile a stub prune produces when every embedded
  // package's referent was pruned away.
  const prunedLockfileAllDropped = () => [
    `lockfileVersion: '9.0'`,
    ``,
    `importers:`,
    ``,
    `  .:`,
    `    dependencies:`,
    `      '@fixture/m':`,
    `        specifier: workspace:*`,
    `        version: link:packages/m`,
    ``,
    `  packages/m: {}`,
    ``,
  ].join('\n')

  // The "regenerated" lockfile the stub prune produces: the dropped
  // package's entries removed everywhere, everything else intact.
  const prunedLockfile = () => [
    `lockfileVersion: '9.0'`,
    ``,
    `importers:`,
    ``,
    `  .:`,
    `    dependencies:`,
    `      '@fixture/m':`,
    `        specifier: workspace:*`,
    `        version: link:packages/m`,
    ``,
    `  packages/m:`,
    `    dependencies:`,
    `      '@acme/kept':`,
    `        specifier: 1.0.0`,
    `        version: 1.0.0`,
    ``,
    `packages:`,
    ``,
    `  '@acme/kept@1.0.0':`,
    `    resolution: {integrity: ${keptIntegrity}}`,
    ``,
    `snapshots:`,
    ``,
    `  '@acme/kept@1.0.0': {}`,
    ``,
  ].join('\n')

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-bundler-embed-')))
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-bundler-embed-cache-'))
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-bundler-embed-home-'))
    await fs.mkdir(path.join(dir, 'packages/m'), { recursive: true })
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'embed-fixture-root',
      private: true,
      dependencies: { '@fixture/m': 'workspace:*' },
    }))
    await fs.writeFile(path.join(dir, 'packages/m/package.json'), JSON.stringify({
      name: '@fixture/m',
      version: '1.0.0',
      dependencies: { '@acme/kept': '1.0.0', '@acme/dropped': '1.0.0' },
    }))
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), originalLockfile())
    stderrWrites = []
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
      // The debug library also writes to stderr when DEBUG is enabled; only
      // the CLI's own user-facing writes are under test.
      const text = String(chunk)
      if (!text.includes('checkly:cli:')) {
        stderrWrites.push(text)
      }
      return true
    })
    vi.stubEnv('CHECKLY_LOCKFILE_PRUNE', '')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    for (const tempDir of [dir, cacheDir, homeDir]) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  const materializerEnv = () => ({
    CHECKLY_CACHE_DIR: cacheDir,
    npm_config_registry: UNREACHABLE_REGISTRY,
  })

  const seedCache = async (...tarballs: Buffer[]) => {
    const cache = TarballCache.default(materializerEnv(), dir, process.platform, homeDir)
    for (const bytes of tarballs) {
      await cache.put(integrityOf(bytes), bytes)
    }
  }

  const makeWorkspace = () => new Workspace({
    root: new Package({ name: 'embed-fixture-root', path: dir }),
    packages: [new Package({ name: '@fixture/m', path: path.join(dir, 'packages/m'), version: '1.0.0' })],
    lockfile: Ok(path.join(dir, 'pnpm-lock.yaml')),
    configFile: Err(new Error('no config file')),
  })

  const makeMaterializer = () => new EmbeddedPackagesMaterializer({
    specs: ['@acme/kept', '@acme/dropped'],
    lockfilePath: path.join(dir, 'pnpm-lock.yaml'),
    workspaceRoot: dir,
    env: materializerEnv(),
    homedir: homeDir,
  })

  // A package manager whose lockfile-only install replaces the lockfile
  // with the given pruned variant, standing in for a real pnpm run.
  const stubPruningPackageManager = async (prunedContent: string = prunedLockfile()) => {
    await fs.writeFile(path.join(dir, 'pruned-lock.yaml'), prunedContent)
    const scriptPath = path.join(dir, 'prune.cjs')
    await fs.writeFile(scriptPath, [
      `const fs = require('fs')`,
      `fs.writeFileSync('pnpm-lock.yaml', fs.readFileSync(${JSON.stringify(path.join(dir, 'pruned-lock.yaml'))}, 'utf8'))`,
    ].join('\n'))
    return Object.assign(Object.create(new PNpmDetector()), {
      lockfileOnlyInstallCommand: () => new Runnable('node', [scriptPath]),
    })
  }

  const registerPartialWorkspace = (bundler: Bundler) => {
    bundler.registerFiles(
      { filePath: path.join(dir, 'package.json'), physical: true },
      { filePath: path.join(dir, 'pnpm-lock.yaml'), physical: true },
      { filePath: path.join(dir, 'packages/m/package.json'), physical: false, content: FAUX_MANIFEST },
    )
  }

  const listEntries = async (archiveFile: string): Promise<string[]> => {
    const entries: string[] = []
    await list({ file: archiveFile, onReadEntry: entry => {
      entries.push(entry.path)
    } })
    return entries
  }

  const expectedHash = async (options: {
    embedded: Array<{ name: string, version: string, integrity: string }>
    // The pruned lockfile content the stub prune produced, or false when
    // pruning did not run.
    pruned: string | false
  }) => {
    return composeWorkspaceCacheHash(await loadWorkspaceCacheHashInputs(makeWorkspace()), {
      embeddedPackages: options.embedded,
      fauxPackageJsons: [{ path: 'packages/m/package.json', raw: Buffer.from(FAUX_MANIFEST, 'utf8') }],
      prunedLockfile: options.pruned !== false
        ? { name: 'pnpm-lock.yaml', hash: createHash('sha256').update(options.pruned).digest() }
        : undefined,
    })
  }

  it('materializes only the tarballs the pruned lockfile still references, without downloading the rest', async () => {
    // Only the kept tarball is seeded: the dropped one exists in no cache
    // and the registry is unreachable, so this passing proves the dropped
    // tarball was never fetched.
    await seedCache(keptBytes)

    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      packageManager: await stubPruningPackageManager(),
      embeddedPackagesMaterializer: makeMaterializer(),
    })
    registerPartialWorkspace(bundler)
    const archive = await bundler.finalize()

    const entries = await listEntries(archive.archiveFile)
    expect(entries).toContain('.checkly/embedded-packages/@acme+kept@1.0.0.tgz')
    expect(entries).not.toContain('.checkly/embedded-packages/@acme+dropped@1.0.0.tgz')

    // Progress is debug-only for now: a successful prune-and-materialize
    // writes nothing user-facing.
    expect(stderrWrites.join('')).toEqual('')

    expect(bundler.cacheHash.toJSON()).toEqual(await expectedHash({
      embedded: [{ name: '@acme/kept', version: '1.0.0', integrity: keptIntegrity }],
      pruned: prunedLockfile(),
    }))
    expect(bundler.cacheHash.toJSON()).not.toEqual(await expectedHash({
      embedded: [
        { name: '@acme/dropped', version: '1.0.0', integrity: droppedIntegrity },
        { name: '@acme/kept', version: '1.0.0', integrity: keptIntegrity },
      ],
      pruned: prunedLockfile(),
    }))
  })

  it('erases the embedded cache-hash records when pruning drops every planned tarball', async () => {
    // Nothing is seeded: with every embedded package dropped, no tarball
    // may be requested at all.
    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      packageManager: await stubPruningPackageManager(prunedLockfileAllDropped()),
      embeddedPackagesMaterializer: makeMaterializer(),
    })
    registerPartialWorkspace(bundler)
    const archive = await bundler.finalize()

    const entries = await listEntries(archive.archiveFile)
    expect(entries.filter(entry => entry.startsWith('.checkly/embedded-packages/'))).toEqual([])
    expect(stderrWrites.join('')).toEqual('')

    // An all-dropped set must hash as [] (no embedded-package records), not
    // fall back to the full planned set.
    expect(bundler.cacheHash.toJSON()).toEqual(await expectedHash({
      embedded: [],
      pruned: prunedLockfileAllDropped(),
    }))
  })

  it('materializes the full planned set when pruning is disabled', async () => {
    vi.stubEnv('CHECKLY_LOCKFILE_PRUNE', '0')
    await seedCache(keptBytes, droppedBytes)

    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      packageManager: await stubPruningPackageManager(),
      embeddedPackagesMaterializer: makeMaterializer(),
    })
    registerPartialWorkspace(bundler)
    const archive = await bundler.finalize()

    const entries = await listEntries(archive.archiveFile)
    expect(entries).toContain('.checkly/embedded-packages/@acme+kept@1.0.0.tgz')
    expect(entries).toContain('.checkly/embedded-packages/@acme+dropped@1.0.0.tgz')

    expect(stderrWrites.join('')).toEqual('')

    expect(bundler.cacheHash.toJSON()).toEqual(await expectedHash({
      embedded: [
        { name: '@acme/dropped', version: '1.0.0', integrity: droppedIntegrity },
        { name: '@acme/kept', version: '1.0.0', integrity: keptIntegrity },
      ],
      pruned: false,
    }))
  })

  it('ships no embedded tarballs when the bundler has no materializer', async () => {
    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      packageManager: await stubPruningPackageManager(),
    })
    registerPartialWorkspace(bundler)
    const archive = await bundler.finalize()

    const entries = await listEntries(archive.archiveFile)
    expect(entries.filter(entry => entry.startsWith('.checkly/embedded-packages/'))).toEqual([])
    // The hash carries no embedded-package records either.
    expect(bundler.cacheHash.toJSON()).toEqual(await expectedHash({
      embedded: [],
      pruned: prunedLockfile(),
    }))
  })

  it('does not materialize anything for an empty bundle', async () => {
    // Every command calls finalize() unconditionally, including on bundles
    // no check registered files into — an empty bundle must not trigger
    // downloads. Nothing is seeded and the registry is unreachable, so a
    // regressed guard turns into a rejected finalize, not a silent pass.
    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      packageManager: await stubPruningPackageManager(),
      embeddedPackagesMaterializer: makeMaterializer(),
    })
    await expect(bundler.finalize()).resolves.toBeDefined()
    expect(stderrWrites.join('')).toEqual('')

    // Nothing ships from an empty bundle, so nothing may reach the hash
    // either: the finalize-time digest carries no embedded-package records,
    // rather than falling back to the full planned set.
    expect(bundler.cacheHash.toJSON()).toEqual(
      composeWorkspaceCacheHash(await loadWorkspaceCacheHashInputs(makeWorkspace()), {}),
    )
    expect(bundler.cacheHash.toJSON()).not.toEqual(await expectedHash({
      embedded: [
        { name: '@acme/dropped', version: '1.0.0', integrity: droppedIntegrity },
        { name: '@acme/kept', version: '1.0.0', integrity: keptIntegrity },
      ],
      pruned: false,
    }))
  })

  it('rejects a plan whose specs all failed to resolve, even when nothing would ship', async () => {
    // The materializer's plan-issues backstop must still fire for a
    // non-empty bundle whose embed specs resolved to nothing at all —
    // matching the pre-deferral behavior where bundling threw.
    const materializer = new EmbeddedPackagesMaterializer({
      specs: ['no-such-package'],
      lockfilePath: path.join(dir, 'pnpm-lock.yaml'),
      workspaceRoot: dir,
      env: materializerEnv(),
      homedir: homeDir,
    })
    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      packageManager: await stubPruningPackageManager(),
      embeddedPackagesMaterializer: materializer,
    })
    registerPartialWorkspace(bundler)
    await expect(bundler.finalize()).rejects.toThrow(EmbeddedPackageError)
  })
})
