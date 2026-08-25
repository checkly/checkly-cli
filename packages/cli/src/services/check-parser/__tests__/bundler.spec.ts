import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { list } from 'tar'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BundleArchive, BundleTooLargeError, Bundler, embeddedPackageHashInputs, FinalizedBundleArchive } from '../bundler.js'
import {
  canonicalizePackageJson,
  composeWorkspaceCacheHash,
  loadWorkspaceCacheHashInputs,
  PACKAGE_JSON_EXCLUDED_FIELDS,
} from '../cache-hash.js'
import { CNpmDetector, npmPackageManager, PNpmDetector, Runnable } from '../package-files/package-manager.js'
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

  it('mixes a yarn.lock embed plan into the cache hash', async () => {
    const lockfilePath = path.join(dir, 'yarn.lock')
    await fs.writeFile(lockfilePath, [
      `__metadata:`,
      `  version: 10`,
      `  cacheKey: 10c0`,
      ``,
      `"@acme/foo@npm:1.2.3":`,
      `  version: 1.2.3`,
      `  resolution: "@acme/foo@npm:1.2.3"`,
      `  checksum: 10c0/aaa`,
      `  languageName: node`,
      `  linkType: hard`,
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

describe('embeddedPackageHashInputs()', () => {
  it('uses the SRI integrity when present and the Berry checksum otherwise', () => {
    // yarn.lock plans carry no npm tarball integrity, so their hash records
    // must carry the lockfile's own checksum — a content pin that is known
    // at plan time, keeping the eager and finalize hashes consistent.
    expect(embeddedPackageHashInputs([
      { name: 'bar', version: '2.0.0', integrity: 'sha512-bbb', archiveFilename: 'bar@2.0.0.tgz' },
      { name: 'ms', version: '2.1.3', lockfileChecksum: '10c0/aaa', archiveFilename: 'ms@2.1.3.tgz' },
    ])).toEqual([
      { name: 'bar', version: '2.0.0', integrity: 'sha512-bbb' },
      { name: 'ms', version: '2.1.3', integrity: '10c0/aaa' },
    ])
  })

  it('passes undefined through for an absent plan', () => {
    expect(embeddedPackageHashInputs(undefined)).toBeUndefined()
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
      // cnpm has no lockfile-only install, so a partial-workspace bundle
      // must surface the unpruned lockfile instead of skipping silently.
      // (Not yarn: yarn gained a lockfile-only install, so it would spawn
      // a real package manager here.)
      packageManager: new CNpmDetector(),
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
      packageManager: new CNpmDetector(),
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

describe('Bundler.finalize() patch filtering', () => {
  let dir: string
  let stderrWrites: string[]

  const MS_HASH = 'a'.repeat(64)
  const EE_HASH = 'b'.repeat(64)

  const FAUX_MANIFEST = '{"name":"@fixture/m","version":"1.0.0"}'

  const patchedDependenciesSection = [
    `patchedDependencies:`,
    `  ee-first@1.1.1:`,
    `    hash: ${EE_HASH}`,
    `    path: patches/ee-first@1.1.1.patch`,
    `  ms@2.1.3:`,
    `    hash: ${MS_HASH}`,
    `    path: patches/ms@2.1.3.patch`,
    ``,
  ]

  // Both patches applied: `ms` in the bundled member, `ee-first` in the member
  // the bundle omits.
  const originalLockfile = () => [
    `lockfileVersion: '9.0'`,
    ``,
    ...patchedDependenciesSection,
    `importers:`,
    ``,
    `  .: {}`,
    ``,
    `  packages/m:`,
    `    dependencies:`,
    `      ms:`,
    `        specifier: 2.1.3`,
    `        version: 2.1.3(patch_hash=${MS_HASH})`,
    ``,
    `  packages/absent:`,
    `    dependencies:`,
    `      ee-first:`,
    `        specifier: 1.1.1`,
    `        version: 1.1.1(patch_hash=${EE_HASH})`,
    ``,
  ].join('\n')

  // What the stub prune produces: the omitted member is gone, so the
  // `ee-first` patch applies to nothing — but its declaration survives, since
  // the section mirrors the config rather than the graph.
  const prunedLockfile = () => [
    `lockfileVersion: '9.0'`,
    ``,
    ...patchedDependenciesSection,
    `importers:`,
    ``,
    `  .: {}`,
    ``,
    `  packages/m:`,
    `    dependencies:`,
    `      ms:`,
    `        specifier: 2.1.3`,
    `        version: 2.1.3(patch_hash=${MS_HASH})`,
    ``,
  ].join('\n')

  const workspaceYaml = () => [
    `packages:`,
    `  - packages/*`,
    `minimumReleaseAge: 2880`,
    `patchedDependencies:`,
    `  ms@2.1.3: patches/ms@2.1.3.patch`,
    `  ee-first@1.1.1: patches/ee-first@1.1.1.patch`,
    ``,
  ].join('\n')

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-bundler-patch-')))
    await fs.mkdir(path.join(dir, 'packages/m'), { recursive: true })
    await fs.mkdir(path.join(dir, 'patches'), { recursive: true })
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'patch-fixture-root',
      private: true,
    }))
    await fs.writeFile(path.join(dir, 'packages/m/package.json'), FAUX_MANIFEST)
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), workspaceYaml())
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), originalLockfile())
    await fs.writeFile(path.join(dir, 'patches/ms@2.1.3.patch'), 'ms patch\n')
    await fs.writeFile(path.join(dir, 'patches/ee-first@1.1.1.patch'), 'ee-first patch\n')

    stderrWrites = []
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
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
    root: new Package({ name: 'patch-fixture-root', path: dir }),
    packages: [new Package({ name: '@fixture/m', path: path.join(dir, 'packages/m'), version: '1.0.0' })],
    lockfile: Ok(path.join(dir, 'pnpm-lock.yaml')),
    configFile: Ok(path.join(dir, 'pnpm-workspace.yaml')),
  })

  const stubPruningPackageManager = async () => {
    await fs.writeFile(path.join(dir, 'pruned-lock.yaml'), prunedLockfile())
    const scriptPath = path.join(dir, 'prune.cjs')
    await fs.writeFile(scriptPath, [
      `const fs = require('fs')`,
      `fs.writeFileSync('pnpm-lock.yaml', fs.readFileSync(${JSON.stringify(path.join(dir, 'pruned-lock.yaml'))}, 'utf8'))`,
    ].join('\n'))
    return Object.assign(Object.create(new PNpmDetector()), {
      lockfileOnlyInstallCommand: () => new Runnable('node', [scriptPath]),
    })
  }

  const makeBundler = async () => {
    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      packageManager: await stubPruningPackageManager(),
    })
    bundler.registerFiles(
      { filePath: path.join(dir, 'package.json'), physical: true },
      { filePath: path.join(dir, 'pnpm-workspace.yaml'), physical: true },
      { filePath: path.join(dir, 'pnpm-lock.yaml'), physical: true },
      { filePath: path.join(dir, 'patches/ms@2.1.3.patch'), physical: true },
      { filePath: path.join(dir, 'patches/ee-first@1.1.1.patch'), physical: true },
      { filePath: path.join(dir, 'packages/m/package.json'), physical: false, content: FAUX_MANIFEST },
    )
    return bundler
  }

  const readArchive = async (archiveFile: string): Promise<Map<string, string>> => {
    const contents = new Map<string, string>()
    await list({ file: archiveFile, onReadEntry: entry => {
      const chunks: Buffer[] = []
      entry.on('data', chunk => chunks.push(chunk as Buffer))
      entry.on('end', () => contents.set(entry.path, Buffer.concat(chunks).toString('utf8')))
      entry.resume()
    } })
    return contents
  }

  it('drops the declaration, patch file and lockfile entry of a patch that no longer applies', async () => {
    const bundler = await makeBundler()
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    expect([...contents.keys()]).toContain('patches/ms@2.1.3.patch')
    expect([...contents.keys()]).not.toContain('patches/ee-first@1.1.1.patch')

    const config = contents.get('pnpm-workspace.yaml')!
    expect(config).toContain('ms@2.1.3: patches/ms@2.1.3.patch')
    expect(config).not.toContain('ee-first')
    // Unrelated settings must survive the rewrite untouched.
    expect(config).toContain('minimumReleaseAge: 2880')

    const lockfile = contents.get('pnpm-lock.yaml')!
    expect(lockfile).toContain(`ms@2.1.3:`)
    expect(lockfile).not.toContain('ee-first')
    expect(lockfile).toContain(`patch_hash=${MS_HASH}`)

    // A successful filter leaves config and lockfile agreeing, so there is
    // nothing to report.
    expect(stderrWrites.join('')).toEqual('')
  })

  it('mixes the filtered lockfile into the cache hash', async () => {
    const bundler = await makeBundler()
    const archive = await bundler.finalize()
    const shipped = (await readArchive(archive.archiveFile)).get('pnpm-lock.yaml')!

    const hashFor = async (lockfileContent: string) =>
      composeWorkspaceCacheHash(await loadWorkspaceCacheHashInputs(makeWorkspace()), {
        embeddedPackages: undefined,
        fauxPackageJsons: [
          { path: 'packages/m/package.json', raw: Buffer.from(FAUX_MANIFEST, 'utf8') },
        ],
        prunedLockfile: {
          name: 'pnpm-lock.yaml',
          hash: createHash('sha256').update(lockfileContent).digest(),
        },
      })

    expect(bundler.cacheHash.toJSON()).toEqual(await hashFor(shipped))
    // The unfiltered pruned lockfile must not produce the same key, or a
    // bundle would reuse a dependency cache built from different patches.
    expect(bundler.cacheHash.toJSON()).not.toEqual(await hashFor(prunedLockfile()))
  })

  it('leaves the bundle alone when both config sites declare patches', async () => {
    // pnpm picks one site and ignores the other wholesale, and which one wins
    // depends on the major, so neither can be edited safely.
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'patch-fixture-root',
      private: true,
      pnpm: { patchedDependencies: { 'ms@2.1.3': 'patches/ms@2.1.3.patch' } },
    }))

    const bundler = await makeBundler()
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    expect([...contents.keys()]).toContain('patches/ee-first@1.1.1.patch')
    expect(contents.get('pnpm-workspace.yaml')).toContain('ee-first')
    expect(contents.get('pnpm-lock.yaml')).toContain('ee-first')
    expect(stderrWrites.join('')).toEqual('')
  })

  it('keeps a declaration the original lockfile never recorded, without reporting it', async () => {
    // A pnpm that does not read the declaration site records nothing, which is
    // no evidence that the patch is unused.
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), [
      `lockfileVersion: '9.0'`,
      ``,
      `importers:`,
      ``,
      `  .: {}`,
      ``,
      `  packages/m: {}`,
      ``,
    ].join('\n'))
    await fs.writeFile(path.join(dir, 'pruned-lock.yaml'), prunedLockfile())

    const bundler = await makeBundler()
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    expect([...contents.keys()]).toContain('patches/ee-first@1.1.1.patch')
    expect(contents.get('pnpm-workspace.yaml')).toContain('ee-first')
    expect(stderrWrites.join('')).toEqual('')
  })

  it('reports a declaration the shipped lockfile does not record when it cannot repair it', async () => {
    // The prune drops the section outright (a pnpm that does not read the
    // declaration site) AND a second site declares patches, so the filtering
    // declines and the mismatch survives into the bundle.
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
      name: 'patch-fixture-root',
      private: true,
      pnpm: { patchedDependencies: { 'ms@2.1.3': 'patches/ms@2.1.3.patch' } },
    }))
    const bundler = await makeBundler()
    await fs.writeFile(path.join(dir, 'pruned-lock.yaml'), [
      `lockfileVersion: '9.0'`,
      ``,
      `importers:`,
      ``,
      `  .: {}`,
      ``,
      `  packages/m: {}`,
      ``,
    ].join('\n'))

    await bundler.finalize()

    expect(stderrWrites.join('')).toContain('declares patches that the bundled lockfile does not record')
    expect(stderrWrites.join('')).toContain('ee-first@1.1.1')
    expect(stderrWrites.join('')).toContain('ms@2.1.3')
  })

  it('filters the root package.json when that is the declaring site', async () => {
    // The YAML and JSON rewrite paths are different code; only this one puts a
    // rewritten manifest into the cache hash as a faux package.json.
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    const manifest = {
      name: 'patch-fixture-root',
      private: true,
      pnpm: {
        patchedDependencies: {
          'ms@2.1.3': 'patches/ms@2.1.3.patch',
          'ee-first@1.1.1': 'patches/ee-first@1.1.1.patch',
        },
      },
    }
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(manifest, null, 2))

    const bundler = await makeBundler()
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    expect(JSON.parse(contents.get('package.json')!).pnpm.patchedDependencies)
      .toEqual({ 'ms@2.1.3': 'patches/ms@2.1.3.patch' })
    expect([...contents.keys()]).not.toContain('patches/ee-first@1.1.1.patch')
    expect(contents.get('pnpm-lock.yaml')).not.toContain('ee-first')

    // The rewritten manifest is what ships, so it is what the dependency cache
    // key must be computed from — canonicalized like any on-disk manifest,
    // since it has an on-disk original.
    const expected = composeWorkspaceCacheHash(await loadWorkspaceCacheHashInputs(makeWorkspace()), {
      embeddedPackages: undefined,
      fauxPackageJsons: [
        {
          path: 'package.json',
          raw: canonicalizePackageJson(
            Buffer.from(contents.get('package.json')!, 'utf8'),
            PACKAGE_JSON_EXCLUDED_FIELDS,
          ),
        },
        { path: 'packages/m/package.json', raw: Buffer.from(FAUX_MANIFEST, 'utf8') },
      ],
      prunedLockfile: {
        name: 'pnpm-lock.yaml',
        hash: createHash('sha256').update(contents.get('pnpm-lock.yaml')!).digest(),
      },
    })
    expect(bundler.cacheHash.toJSON()).toEqual(expected)
  })

  it('does not change the cache key when only the root manifest version is bumped', async () => {
    // The rewritten manifest ships as a synthesized file, and hashing those
    // verbatim would make a release bump alone discard the runner's dependency
    // cache even though no install input changed.
    const manifest = (version: string) => JSON.stringify({
      name: 'patch-fixture-root',
      version,
      private: true,
      pnpm: {
        patchedDependencies: {
          'ms@2.1.3': 'patches/ms@2.1.3.patch',
          'ee-first@1.1.1': 'patches/ee-first@1.1.1.patch',
        },
      },
    }, null, 2)
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')

    await fs.writeFile(path.join(dir, 'package.json'), manifest('1.0.0'))
    const before = await makeBundler()
    await before.finalize()

    await fs.writeFile(path.join(dir, 'package.json'), manifest('1.0.1'))
    const after = await makeBundler()
    await after.finalize()

    expect(after.cacheHash.toJSON()).toEqual(before.cacheHash.toJSON())
  })

  it('never deletes a bundled file outside the conventional patches directory', async () => {
    // A declared patch path can name any bundled file. Here the dropped
    // declaration points at a `.patch` fixture that a check's own include glob
    // put in the bundle; removing it would take content the check needs.
    await fs.mkdir(path.join(dir, 'fixtures'), { recursive: true })
    await fs.writeFile(path.join(dir, 'fixtures/ee.patch'), 'fixture content\n')
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), [
      `packages:`,
      `  - packages/*`,
      `patchedDependencies:`,
      `  ms@2.1.3: patches/ms@2.1.3.patch`,
      `  ee-first@1.1.1: fixtures/ee.patch`,
      ``,
    ].join('\n'))

    const bundler = await makeBundler()
    bundler.registerFiles({ filePath: path.join(dir, 'fixtures/ee.patch'), physical: true })
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    // The declaration still goes; only the file survives.
    expect(contents.get('pnpm-workspace.yaml')).not.toContain('ee-first')
    expect([...contents.keys()]).toContain('fixtures/ee.patch')
    expect(contents.get('fixtures/ee.patch')).toEqual('fixture content\n')
  })

  it('leaves patches alone when the bundled config is archived at another path', async () => {
    // A config reached through a symlink is bundled at the link's path while
    // its filePath points elsewhere. A virtual replacement takes its archive
    // name from filePath, so it would land somewhere else than the entry it
    // replaces — the step declines rather than move it.
    await fs.mkdir(path.join(dir, 'elsewhere'), { recursive: true })
    await fs.writeFile(path.join(dir, 'elsewhere/pnpm-workspace.yaml'), workspaceYaml())

    const bundler = await makeBundler()
    bundler.registerFiles({
      filePath: path.join(dir, 'elsewhere/pnpm-workspace.yaml'),
      physical: true,
      archivePath: 'pnpm-workspace.yaml',
    })

    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    expect([...contents.keys()]).toContain('patches/ee-first@1.1.1.patch')
    expect(contents.get('pnpm-lock.yaml')).toContain('ee-first')
  })
})

describe('Bundler.finalize() package pruning', () => {
  let dir: string
  let stderrWrites: string[]

  const rootManifest = (extra: object = {}) => JSON.stringify({
    // Deliberately versionless, like most workspace roots: pruning the root
    // manifest must not trip the pruner's unknown-version bail.
    name: 'prune-fixture-root',
    private: true,
    devDependencies: {
      '@acme/tooling': '^1.0.0',
      'typescript': '^5.4.0',
    },
    ...extra,
  }, null, 2)

  const memberManifest = (version = '1.0.0') => JSON.stringify({
    name: '@fixture/m',
    version,
    dependencies: { ms: '2.1.3' },
    peerDependencies: {
      '@acme/heavy-icons': '^6.0.0',
      'react': '^18.0.0',
    },
    peerDependenciesMeta: {
      '@acme/heavy-icons': { optional: false },
    },
  }, null, 2)

  // The `packages/absent` importer is not a workspace member, so the stub
  // "regeneration" below may drop it — and must produce output that differs
  // from the original, or the pruner reports a byte-identical regeneration
  // as a skip.
  const originalLockfile = () => [
    `lockfileVersion: '9.0'`,
    ``,
    `importers:`,
    ``,
    `  .: {}`,
    ``,
    `  packages/m:`,
    `    dependencies:`,
    `      ms:`,
    `        specifier: 2.1.3`,
    `        version: 2.1.3`,
    ``,
    `  packages/absent:`,
    `    dependencies:`,
    `      ee-first:`,
    `        specifier: 1.1.1`,
    `        version: 1.1.1`,
    ``,
  ].join('\n')

  const prunedLockfile = () => [
    `lockfileVersion: '9.0'`,
    ``,
    `importers:`,
    ``,
    `  .: {}`,
    ``,
    `  packages/m:`,
    `    dependencies:`,
    `      ms:`,
    `        specifier: 2.1.3`,
    `        version: 2.1.3`,
    ``,
  ].join('\n')

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-bundler-prune-')))
    await fs.mkdir(path.join(dir, 'packages/m'), { recursive: true })
    await fs.writeFile(path.join(dir, 'package.json'), rootManifest())
    await fs.writeFile(path.join(dir, 'packages/m/package.json'), memberManifest())
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), originalLockfile())

    stderrWrites = []
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
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
    root: new Package({ name: 'prune-fixture-root', path: dir }),
    packages: [new Package({ name: '@fixture/m', path: path.join(dir, 'packages/m'), version: '1.0.0' })],
    lockfile: Ok(path.join(dir, 'pnpm-lock.yaml')),
    configFile: Ok(path.join(dir, 'pnpm-workspace.yaml')),
  })

  const stubPruningPackageManager = async (options: { fail?: boolean, copySeenManifests?: boolean } = {}) => {
    await fs.writeFile(path.join(dir, 'pruned-lock.yaml'), prunedLockfile())
    const scriptPath = path.join(dir, 'prune.cjs')
    const lines = [`const fs = require('fs')`]
    if (options.fail) {
      lines.push(`process.exit(1)`)
    }
    if (options.copySeenManifests) {
      // Captures what the lockfile-only install actually resolves against:
      // the manifests materialized into the temp dir, which must already be
      // the pruned ones.
      lines.push(`fs.copyFileSync('package.json', ${JSON.stringify(path.join(dir, 'seen-root.json'))})`)
      lines.push(
        `fs.copyFileSync('packages/m/package.json', ${JSON.stringify(path.join(dir, 'seen-member.json'))})`,
      )
    }
    lines.push(
      `fs.writeFileSync('pnpm-lock.yaml', fs.readFileSync(${
        JSON.stringify(path.join(dir, 'pruned-lock.yaml'))}, 'utf8'))`,
    )
    await fs.writeFile(scriptPath, lines.join('\n'))
    return Object.assign(Object.create(new PNpmDetector()), {
      lockfileOnlyInstallCommand: () => new Runnable('node', [scriptPath]),
    })
  }

  const makeBundler = async (options: {
    prune?: any
    packageManager?: any
    materializer?: EmbeddedPackagesMaterializer
    skipLockfile?: boolean
  } = {}) => {
    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      packageManager: options.packageManager ?? await stubPruningPackageManager(),
      embeddedPackagesMaterializer: options.materializer,
      packagePrune: options.prune,
    })
    bundler.registerFiles(
      { filePath: path.join(dir, 'package.json'), physical: true },
      { filePath: path.join(dir, 'pnpm-workspace.yaml'), physical: true },
      { filePath: path.join(dir, 'packages/m/package.json'), physical: true },
    )
    if (!options.skipLockfile) {
      bundler.registerFiles({ filePath: path.join(dir, 'pnpm-lock.yaml'), physical: true })
    }
    return bundler
  }

  const readArchive = async (archiveFile: string): Promise<Map<string, string>> => {
    const contents = new Map<string, string>()
    await list({ file: archiveFile, onReadEntry: entry => {
      const chunks: Buffer[] = []
      entry.on('data', chunk => chunks.push(chunk as Buffer))
      entry.on('end', () => contents.set(entry.path, Buffer.concat(chunks).toString('utf8')))
      entry.resume()
    } })
    return contents
  }

  it('removes matching packages from the bundled manifests and prunes the lockfile', async () => {
    const bundler = await makeBundler({ prune: ['@acme/*'] })
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    const root = JSON.parse(contents.get('package.json')!)
    expect(root.devDependencies).toEqual({ typescript: '^5.4.0' })
    expect(root.name).toEqual('prune-fixture-root')

    const member = JSON.parse(contents.get('packages/m/package.json')!)
    expect(member.peerDependencies).toEqual({ react: '^18.0.0' })
    expect(member.peerDependenciesMeta).toBeUndefined()
    expect(member.dependencies).toEqual({ ms: '2.1.3' })
    expect(member.version).toEqual('1.0.0')

    // The versionless-root bundle still went through lockfile pruning.
    expect(contents.get('pnpm-lock.yaml')).toEqual(prunedLockfile())

    // The on-disk manifests are untouched.
    expect(await fs.readFile(path.join(dir, 'package.json'), 'utf8')).toEqual(rootManifest())
    expect(await fs.readFile(path.join(dir, 'packages/m/package.json'), 'utf8')).toEqual(memberManifest())

    expect(stderrWrites.join('')).toEqual('')
  })

  it('removes a whole dependency class with true, meta included', async () => {
    const bundler = await makeBundler({ prune: { peerDependencies: true } })
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    const member = JSON.parse(contents.get('packages/m/package.json')!)
    expect(member.peerDependencies).toBeUndefined()
    expect(member.peerDependenciesMeta).toBeUndefined()
    expect(member.dependencies).toEqual({ ms: '2.1.3' })

    // The root has no peerDependencies, so it ships physical and verbatim.
    expect(contents.get('package.json')).toEqual(rootManifest())
  })

  it('mixes the pruned manifests and lockfile into the cache hash', async () => {
    const bundler = await makeBundler({ prune: ['@acme/*'] })
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    // Rewritten manifests hash canonicalized — like the on-disk manifests
    // they replace — from the shipped bytes.
    const expected = composeWorkspaceCacheHash(await loadWorkspaceCacheHashInputs(makeWorkspace()), {
      embeddedPackages: undefined,
      fauxPackageJsons: [
        {
          path: 'package.json',
          raw: canonicalizePackageJson(
            Buffer.from(contents.get('package.json')!, 'utf8'),
            PACKAGE_JSON_EXCLUDED_FIELDS,
          ),
        },
        {
          path: 'packages/m/package.json',
          raw: canonicalizePackageJson(
            Buffer.from(contents.get('packages/m/package.json')!, 'utf8'),
            PACKAGE_JSON_EXCLUDED_FIELDS,
          ),
        },
      ],
      prunedLockfile: {
        name: 'pnpm-lock.yaml',
        hash: createHash('sha256').update(contents.get('pnpm-lock.yaml')!).digest(),
      },
    })
    expect(bundler.cacheHash.toJSON()).toEqual(expected)

    const baseline = await makeBundler()
    await baseline.finalize()
    expect(bundler.cacheHash.toJSON()).not.toEqual(baseline.cacheHash.toJSON())
  })

  it('does not change the cache key when only a manifest version is bumped', async () => {
    const before = await makeBundler({ prune: ['@acme/*'] })
    await before.finalize()

    await fs.writeFile(path.join(dir, 'packages/m/package.json'), memberManifest('1.0.1'))
    const after = await makeBundler({ prune: ['@acme/*'] })
    await after.finalize()

    expect(after.cacheHash.toJSON()).toEqual(before.cacheHash.toJSON())
  })

  it('leaves everything alone when the prune matches nothing', async () => {
    const bundler = await makeBundler({ prune: ['@other/*'] })
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    // Untouched manifests stay physical, so the full-workspace bundle skips
    // lockfile pruning exactly as it does without the option.
    expect(contents.get('package.json')).toEqual(rootManifest())
    expect(contents.get('packages/m/package.json')).toEqual(memberManifest())
    expect(contents.get('pnpm-lock.yaml')).toEqual(originalLockfile())

    const baseline = await makeBundler()
    await baseline.finalize()
    expect(bundler.cacheHash.toJSON()).toEqual(baseline.cacheHash.toJSON())
    expect(stderrWrites.join('')).toEqual('')
  })

  it('feeds the pruned manifests into the lockfile-only install', async () => {
    const bundler = await makeBundler({
      prune: ['@acme/*'],
      packageManager: await stubPruningPackageManager({ copySeenManifests: true }),
    })
    await bundler.finalize()

    const seenRoot = JSON.parse(await fs.readFile(path.join(dir, 'seen-root.json'), 'utf8'))
    expect(seenRoot.devDependencies).toEqual({ typescript: '^5.4.0' })
    const seenMember = JSON.parse(await fs.readFile(path.join(dir, 'seen-member.json'), 'utf8'))
    expect(seenMember.peerDependencies).toEqual({ react: '^18.0.0' })
  })

  it('rolls the manifests back when the lockfile prune fails', async () => {
    const bundler = await makeBundler({
      prune: ['@acme/*'],
      packageManager: await stubPruningPackageManager({ fail: true }),
    })
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    // Pruned manifests must never ship next to the original lockfile.
    expect(contents.get('package.json')).toEqual(rootManifest())
    expect(contents.get('packages/m/package.json')).toEqual(memberManifest())
    expect(contents.get('pnpm-lock.yaml')).toEqual(originalLockfile())

    const stderr = stderrWrites.join('')
    expect(stderr).toContain('could not prune the bundled lockfile')
    expect(stderr).toContain('bundle.packages.prune was not applied')

    // The rolled-back bundle must also share the unpruned bundle's cache
    // key: the shipped bytes are identical.
    const baseline = await makeBundler()
    await baseline.finalize()
    expect(bundler.cacheHash.toJSON()).toEqual(baseline.cacheHash.toJSON())
  })

  it('rolls the manifests back when pruning is disabled via CHECKLY_LOCKFILE_PRUNE=0', async () => {
    vi.stubEnv('CHECKLY_LOCKFILE_PRUNE', '0')
    const bundler = await makeBundler({ prune: ['@acme/*'] })
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    expect(contents.get('package.json')).toEqual(rootManifest())
    expect(contents.get('packages/m/package.json')).toEqual(memberManifest())
    expect(contents.get('pnpm-lock.yaml')).toEqual(originalLockfile())
    expect(stderrWrites.join('')).toContain('bundle.packages.prune was not applied')
  })

  it('keeps the pruned manifests when the bundle ships no lockfile', async () => {
    const bundler = await makeBundler({ prune: ['@acme/*'], skipLockfile: true })
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    // Without a bundled lockfile the manifests are the install's only
    // input, so nothing can fall out of sync and the prune stands.
    expect(JSON.parse(contents.get('package.json')!).devDependencies).toEqual({ typescript: '^5.4.0' })
    expect(JSON.parse(contents.get('packages/m/package.json')!).peerDependencies).toEqual({ react: '^18.0.0' })
    expect([...contents.keys()]).not.toContain('pnpm-lock.yaml')
    expect(stderrWrites.join('')).toEqual('')
  })

  it('warns and ships the original when a bundled manifest cannot be pruned', async () => {
    // A manifest whose serialization is lossy (-0 stringifies as 0, which
    // isDeepStrictEqual distinguishes) fails the rewrite verification,
    // standing in for any unrewritable manifest.
    const lossyManifest = memberManifest().replace(
      '"dependencies"',
      '"someTool": { "limit": -0 },\n  "dependencies"',
    )
    await fs.writeFile(path.join(dir, 'packages/m/package.json'), lossyManifest)
    const bundler = await makeBundler({ prune: ['@acme/*'] })
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    // The member shipped unchanged; the root was still pruned, and the
    // lockfile pruned with it.
    expect(contents.get('packages/m/package.json')).toEqual(lossyManifest)
    expect(JSON.parse(contents.get('package.json')!).devDependencies).toEqual({ typescript: '^5.4.0' })
    expect(contents.get('pnpm-lock.yaml')).toEqual(prunedLockfile())
    expect(stderrWrites.join(''))
      .toContain('could not apply bundle.packages.prune to packages/m/package.json')
  })

  it('skips a faux member manifest without a warning', async () => {
    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      packageManager: await stubPruningPackageManager(),
      packagePrune: ['@acme/*'],
    })
    bundler.registerFiles(
      { filePath: path.join(dir, 'package.json'), physical: true },
      { filePath: path.join(dir, 'pnpm-workspace.yaml'), physical: true },
      { filePath: path.join(dir, 'pnpm-lock.yaml'), physical: true },
      {
        filePath: path.join(dir, 'packages/m/package.json'),
        physical: false,
        content: '{"name":"@fixture/m","version":"1.0.0"}',
      },
    )
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    // A synthesized shim has nothing to prune; only the root is rewritten.
    expect(contents.get('packages/m/package.json')).toEqual('{"name":"@fixture/m","version":"1.0.0"}')
    expect(JSON.parse(contents.get('package.json')!).devDependencies).toEqual({ typescript: '^5.4.0' })
    expect(stderrWrites.join('')).toEqual('')
  })

  it('keeps the pruned manifests when the regenerated lockfile is byte-identical', async () => {
    // An identical regeneration proves the shipped lockfile already matches
    // the pruned manifests — e.g. peers never recorded in the importers —
    // so there is nothing to roll back and nothing to warn about.
    const bundler = await makeBundler({ prune: ['@acme/*'] })
    await fs.writeFile(path.join(dir, 'pruned-lock.yaml'), originalLockfile())
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    expect(JSON.parse(contents.get('package.json')!).devDependencies).toEqual({ typescript: '^5.4.0' })
    expect(JSON.parse(contents.get('packages/m/package.json')!).peerDependencies).toEqual({ react: '^18.0.0' })
    expect(contents.get('pnpm-lock.yaml')).toEqual(originalLockfile())
    expect(stderrWrites.join('')).toEqual('')
  })

  it('composes with the patch filtering on the same root manifest', async () => {
    const MS_HASH = 'a'.repeat(64)
    const EE_HASH = 'b'.repeat(64)
    await fs.writeFile(path.join(dir, 'package.json'), rootManifest({
      pnpm: {
        patchedDependencies: {
          'ms@2.1.3': 'patches/ms@2.1.3.patch',
          'ee-first@1.1.1': 'patches/ee-first@1.1.1.patch',
        },
      },
    }))
    await fs.mkdir(path.join(dir, 'patches'), { recursive: true })
    await fs.writeFile(path.join(dir, 'patches/ms@2.1.3.patch'), 'ms patch\n')
    await fs.writeFile(path.join(dir, 'patches/ee-first@1.1.1.patch'), 'ee-first patch\n')
    const patchSection = [
      `patchedDependencies:`,
      `  ee-first@1.1.1:`,
      `    hash: ${EE_HASH}`,
      `    path: patches/ee-first@1.1.1.patch`,
      `  ms@2.1.3:`,
      `    hash: ${MS_HASH}`,
      `    path: patches/ms@2.1.3.patch`,
      ``,
    ].join('\n')
    await fs.writeFile(
      path.join(dir, 'pnpm-lock.yaml'),
      originalLockfile()
        .replace(`        version: 2.1.3`, `        version: 2.1.3(patch_hash=${MS_HASH})`)
        .replace(`        version: 1.1.1`, `        version: 1.1.1(patch_hash=${EE_HASH})`)
        .replace(`importers:`, `${patchSection}\nimporters:`),
    )

    const bundler = await makeBundler({ prune: ['@acme/*'] })
    // After makeBundler: creating the stub package manager rewrites
    // pruned-lock.yaml with the plain fixture content.
    await fs.writeFile(
      path.join(dir, 'pruned-lock.yaml'),
      prunedLockfile()
        .replace(`        version: 2.1.3`, `        version: 2.1.3(patch_hash=${MS_HASH})`)
        .replace(`importers:`, `${patchSection}\nimporters:`),
    )
    bundler.registerFiles(
      { filePath: path.join(dir, 'patches/ms@2.1.3.patch'), physical: true },
      { filePath: path.join(dir, 'patches/ee-first@1.1.1.patch'), physical: true },
    )
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    // Both rewrites land in the same shipped manifest: the pruned dev
    // dependency is gone, and so is the unused patch declaration.
    const root = JSON.parse(contents.get('package.json')!)
    expect(root.devDependencies).toEqual({ typescript: '^5.4.0' })
    expect(root.pnpm.patchedDependencies).toEqual({ 'ms@2.1.3': 'patches/ms@2.1.3.patch' })
    expect([...contents.keys()]).not.toContain('patches/ee-first@1.1.1.patch')
  })

  it('drops embedded packages whose referents were pruned away', async () => {
    const tarballBytes = Buffer.from('heavy-icons-tarball')
    await fs.writeFile(path.join(dir, 'heavy-icons.tgz'), tarballBytes)
    const integrity = `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`
    // The original lockfile records the package the member's pruned
    // dependency class referenced; the stub-pruned lockfile no longer does.
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), [
      originalLockfile(),
      `packages:`,
      ``,
      `  '@acme/heavy-icons@6.6.0':`,
      `    resolution: {integrity: ${integrity}}`,
      ``,
      `snapshots:`,
      ``,
      `  '@acme/heavy-icons@6.6.0': {}`,
      ``,
    ].join('\n'))

    const materializeCalls: unknown[][] = []
    const materializer = {
      // eslint-disable-next-line require-await
      plan: async () => ({
        tarballs: [{
          name: '@acme/heavy-icons',
          version: '6.6.0',
          integrity,
          archiveFilename: 'acme-heavy-icons-6.6.0.tgz',
        }],
        issues: [],
        warnings: [],
      }),
      // eslint-disable-next-line require-await
      materializeTarballs: async (kept: any[]) => {
        materializeCalls.push(kept)
        return kept.map(tarball => ({
          ...tarball,
          filePath: path.join(dir, 'heavy-icons.tgz'),
          archivePath: `.checkly/embedded-packages/${tarball.archiveFilename}`,
        }))
      },
    } as unknown as EmbeddedPackagesMaterializer

    const bundler = await makeBundler({ prune: ['@acme/*'], materializer })
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    expect(materializeCalls).toEqual([[]])
    expect([...contents.keys()].some(key => key.startsWith('.checkly/embedded-packages/'))).toBe(false)
  })

  it('does nothing on an empty bundle', async () => {
    const bundler = await Bundler.createForWorkspace(makeWorkspace(), {
      tempDir: path.join(dir, 'out'),
      packageManager: await stubPruningPackageManager(),
      packagePrune: ['@acme/*'],
    })
    const archive = await bundler.finalize()
    const contents = await readArchive(archive.archiveFile)

    expect(contents.size).toEqual(0)
    expect(stderrWrites.join('')).toEqual('')
  })
})

// The tests above stub the prune. This one runs the real thing end to end:
// real pnpm regenerates the lockfile, and the filtering decides from what it
// actually wrote — the only place the flag, the prune and the filtering are
// exercised together.
describe('Bundler.finalize() patch filtering with real pnpm', () => {
  const FIXTURE_ROOT = path.join(__dirname, 'lockfile-pruner-fixtures', 'pnpm-patched-workspace')

  let dir: string
  let stderrWrites: string[]

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-bundler-realpatch-')))
    await fs.cp(FIXTURE_ROOT, dir, { recursive: true })
    stderrWrites = []
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
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

  it('drops the patch the pruned workspace no longer applies, and keeps the one it does', async () => {
    const member = (name: string) =>
      new Package({ name: `@fixture/${name}`, path: path.join(dir, 'packages', name), version: '1.0.0' })

    const bundler = await Bundler.createForWorkspace(new Workspace({
      root: new Package({ name: 'lockfile-pruner-fixture', path: dir }),
      packages: [member('used'), member('shimmed'), member('absent')],
      lockfile: Ok(path.join(dir, 'pnpm-lock.yaml')),
      configFile: Ok(path.join(dir, 'pnpm-workspace.yaml')),
    }), {
      tempDir: path.join(dir, 'out'),
      packageManager: new PNpmDetector(),
    })

    // A partial-workspace bundle: `used` ships for real, `shimmed` as a
    // dependency-free placeholder, `absent` not at all — so `ee-first`, and
    // with it the patch on it, falls out of the dependency graph.
    bundler.registerFiles(
      { filePath: path.join(dir, 'package.json'), physical: true },
      { filePath: path.join(dir, 'pnpm-workspace.yaml'), physical: true },
      { filePath: path.join(dir, 'pnpm-lock.yaml'), physical: true },
      { filePath: path.join(dir, 'patches/ms@2.1.3.patch'), physical: true },
      { filePath: path.join(dir, 'patches/ee-first@1.1.1.patch'), physical: true },
      { filePath: path.join(dir, 'packages/used/package.json'), physical: true },
      {
        filePath: path.join(dir, 'packages/shimmed/package.json'),
        physical: false,
        content: '{"name":"@fixture/shimmed","version":"1.0.0"}',
      },
    )

    const archive = await bundler.finalize()

    const contents = new Map<string, string>()
    await list({ file: archive.archiveFile, onReadEntry: entry => {
      const chunks: Buffer[] = []
      entry.on('data', chunk => chunks.push(chunk as Buffer))
      entry.on('end', () => contents.set(entry.path, Buffer.concat(chunks).toString('utf8')))
      entry.resume()
    } })

    expect([...contents.keys()]).toContain('patches/ms@2.1.3.patch')
    expect([...contents.keys()]).not.toContain('patches/ee-first@1.1.1.patch')
    expect(contents.get('pnpm-workspace.yaml')).toContain('ms@2.1.3')
    expect(contents.get('pnpm-workspace.yaml')).not.toContain('ee-first')
    expect(contents.get('pnpm-lock.yaml')).toContain('ms@2.1.3')
    expect(contents.get('pnpm-lock.yaml')).not.toContain('ee-first')
    expect(stderrWrites.join('')).toEqual('')

    // Only the bundled COPY is rewritten. The user's own config, lockfile and
    // patch files are inputs to bundling and must come out of it untouched.
    expect(await fs.readFile(path.join(dir, 'pnpm-workspace.yaml'), 'utf8'))
      .toEqual(await fs.readFile(path.join(FIXTURE_ROOT, 'pnpm-workspace.yaml'), 'utf8'))
    expect(await fs.readFile(path.join(dir, 'pnpm-lock.yaml'), 'utf8'))
      .toEqual(await fs.readFile(path.join(FIXTURE_ROOT, 'pnpm-lock.yaml'), 'utf8'))
    expect(await fs.readFile(path.join(dir, 'patches/ee-first@1.1.1.patch'), 'utf8'))
      .toEqual(await fs.readFile(path.join(FIXTURE_ROOT, 'patches/ee-first@1.1.1.patch'), 'utf8'))
  }, 60_000)
})
