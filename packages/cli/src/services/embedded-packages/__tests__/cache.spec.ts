import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { TarballCache, lookupNpmCacache, resolveCacheDirs } from '../cache.js'

const content = Buffer.from('fake tarball content')
const sha512Base64 = createHash('sha512').update(content).digest('base64')
const sha512Hex = createHash('sha512').update(content).digest('hex')
const integrity = `sha512-${sha512Base64}`

describe('resolveCacheDirs()', () => {
  const home = path.sep === '/' ? '/home/user' : 'C:\\Users\\user'

  it('makes CHECKLY_CACHE_DIR the sole location', () => {
    expect(resolveCacheDirs({ CHECKLY_CACHE_DIR: '/tmp/custom-cache' }, '/proj', 'linux', home))
      .toEqual([path.resolve('/tmp/custom-cache')])
  })

  it('puts node_modules/.cache/checkly first, backed by the per-user dir', () => {
    expect(resolveCacheDirs({}, '/proj', 'linux', home)).toEqual([
      path.join('/proj', 'node_modules', '.cache', 'checkly'),
      path.join(home, '.cache', 'checkly'),
    ])
  })

  it('uses Library/Caches on macOS without a project root', () => {
    expect(resolveCacheDirs({}, undefined, 'darwin', home))
      .toEqual([path.join(home, 'Library', 'Caches', 'checkly')])
  })

  it('uses XDG_CACHE_HOME when set without a project root', () => {
    expect(resolveCacheDirs({ XDG_CACHE_HOME: '/xdg-cache' }, undefined, 'linux', home))
      .toEqual([path.join('/xdg-cache', 'checkly')])
  })

  it('falls back to ~/.cache elsewhere without a project root', () => {
    expect(resolveCacheDirs({}, undefined, 'linux', home)).toEqual([path.join(home, '.cache', 'checkly')])
  })
})

describe('TarballCache', () => {
  let dir: string
  let cache: TarballCache

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-tarball-cache-'))
    cache = new TarballCache(dir)
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('misses on an empty cache', async () => {
    await expect(cache.get(integrity)).resolves.toBeUndefined()
  })

  it('round-trips content through put and get', async () => {
    const putPath = await cache.put(integrity, content)
    await expect(fs.readFile(putPath)).resolves.toEqual(content)
    await expect(cache.get(integrity)).resolves.toBe(putPath)
  })

  it('treats a corrupted entry as a miss and removes it', async () => {
    const putPath = await cache.put(integrity, content)
    await fs.writeFile(putPath, 'corrupted')
    await expect(cache.get(integrity)).resolves.toBeUndefined()
    await expect(fs.access(putPath)).rejects.toThrow()
  })

  it('rejects put without a supported integrity hash', async () => {
    await expect(cache.put('md5-abcdef', content)).rejects.toThrow(/supported integrity hash/)
  })
})

describe('lookupNpmCacache()', () => {
  let home: string

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-cacache-home-'))
    const contentPath = path.join(
      home, '.npm', '_cacache', 'content-v2', 'sha512',
      sha512Hex.slice(0, 2), sha512Hex.slice(2, 4), sha512Hex.slice(4),
    )
    await fs.mkdir(path.dirname(contentPath), { recursive: true })
    await fs.writeFile(contentPath, content)
  })

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true })
  })

  it('finds content by sha512 integrity', async () => {
    await expect(lookupNpmCacache(integrity, {}, 'linux', home)).resolves.toEqual(content)
  })

  it('honors npm_config_cache', async () => {
    const otherCache = path.join(home, 'other-npm-cache')
    await fs.cp(path.join(home, '.npm'), otherCache, { recursive: true })
    await fs.rm(path.join(home, '.npm'), { recursive: true })
    await expect(lookupNpmCacache(integrity, { npm_config_cache: otherCache }, 'linux', home))
      .resolves.toEqual(content)
  })

  it('misses for absent content', async () => {
    const missing = `sha512-${createHash('sha512').update('other').digest('base64')}`
    await expect(lookupNpmCacache(missing, {}, 'linux', home)).resolves.toBeUndefined()
  })

  it('skips sha1-only integrity', async () => {
    const sha1 = `sha1-${createHash('sha1').update(content).digest('base64')}`
    await expect(lookupNpmCacache(sha1, {}, 'linux', home)).resolves.toBeUndefined()
  })

  it('uses the LOCALAPPDATA npm-cache location on Windows', async () => {
    const localAppData = path.join(home, 'AppDataLocal')
    const contentPath = path.join(
      localAppData, 'npm-cache', '_cacache', 'content-v2', 'sha512',
      sha512Hex.slice(0, 2), sha512Hex.slice(2, 4), sha512Hex.slice(4),
    )
    await fs.mkdir(path.dirname(contentPath), { recursive: true })
    await fs.writeFile(contentPath, content)
    await expect(lookupNpmCacache(integrity, { LOCALAPPDATA: localAppData }, 'win32', home))
      .resolves.toEqual(content)
  })

  it('rejects cacache content that fails integrity verification', async () => {
    const contentPath = path.join(
      home, '.npm', '_cacache', 'content-v2', 'sha512',
      sha512Hex.slice(0, 2), sha512Hex.slice(2, 4), sha512Hex.slice(4),
    )
    await fs.writeFile(contentPath, 'tampered')
    await expect(lookupNpmCacache(integrity, {}, 'linux', home)).resolves.toBeUndefined()
  })
})

describe('TarballCache.default()', () => {
  let home: string
  let projectRoot: string

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-cache-home-'))
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-cache-proj-'))
  })

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true })
    await fs.rm(projectRoot, { recursive: true, force: true })
  })

  it('writes to node_modules/.cache under the project root', async () => {
    const cache = TarballCache.default({}, projectRoot, 'linux', home)
    const putPath = await cache.put(integrity, content)
    expect(putPath.startsWith(
      path.join(projectRoot, 'node_modules', '.cache', 'checkly', 'embedded-packages'),
    )).toBe(true)
  })

  it('falls back to the per-user cache when the project location is not writable', async () => {
    // A regular file where node_modules would go makes every mkdir under it
    // fail deterministically on all platforms.
    await fs.writeFile(path.join(projectRoot, 'node_modules'), 'not a directory')

    const cache = TarballCache.default({}, projectRoot, 'linux', home)
    const putPath = await cache.put(integrity, content)
    expect(putPath.startsWith(path.join(home, '.cache', 'checkly', 'embedded-packages'))).toBe(true)
  })

  it('reads entries from the per-user fallback tier', async () => {
    const userCache = TarballCache.default({}, undefined, 'linux', home)
    await userCache.put(integrity, content)

    const cache = TarballCache.default({}, projectRoot, 'linux', home)
    await expect(cache.get(integrity)).resolves.toBeDefined()
  })

  it('throws an actionable error when no cache location is writable', async () => {
    const blocker = path.join(projectRoot, 'blocker')
    await fs.writeFile(blocker, 'not a directory')

    const cache = TarballCache.default(
      { CHECKLY_CACHE_DIR: path.join(blocker, 'cache') }, projectRoot, 'linux', home,
    )
    const error = await cache.put(integrity, content).catch(err => err)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('Unable to write the embedded-packages cache')
    expect(error.message).toContain(path.join(blocker, 'cache'))
    expect(error.message).toContain('CHECKLY_CACHE_DIR')
    expect(error.cause).toBeDefined()
  })
})
