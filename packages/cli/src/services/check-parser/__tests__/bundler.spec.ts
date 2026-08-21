import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BundleArchive, BundleTooLargeError, Bundler, FinalizedBundleArchive } from '../bundler.js'
import { Package, Workspace } from '../package-files/workspace.js'
import { Err, Ok } from '../package-files/result.js'
import { EmbeddedPackagesMaterializer } from '../../embedded-packages/materializer.js'
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

    const without = await Bundler.createForWorkspace(workspace)
    const withFoo = await Bundler.createForWorkspace(workspace, {
      embeddedPackagesMaterializer: new EmbeddedPackagesMaterializer({
        specs: ['@acme/foo'],
        lockfilePath,
        workspaceRoot: dir,
      }),
    })

    expect(without.cacheHash).not.toBe(withFoo.cacheHash)
  })
})
