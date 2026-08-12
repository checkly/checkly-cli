import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { TarballCache, lookupNpmCacache, resolveCacheDir } from '../cache.js'

const content = Buffer.from('fake tarball content')
const sha512Base64 = createHash('sha512').update(content).digest('base64')
const sha512Hex = createHash('sha512').update(content).digest('hex')
const integrity = `sha512-${sha512Base64}`

describe('resolveCacheDir()', () => {
  const home = path.sep === '/' ? '/home/user' : 'C:\\Users\\user'

  it('honors CHECKLY_CACHE_DIR', () => {
    expect(resolveCacheDir({ CHECKLY_CACHE_DIR: '/tmp/custom-cache' }, 'linux', home))
      .toBe(path.resolve('/tmp/custom-cache'))
  })

  it('uses Library/Caches on macOS', () => {
    expect(resolveCacheDir({}, 'darwin', home)).toBe(path.join(home, 'Library', 'Caches', 'checkly'))
  })

  it('uses XDG_CACHE_HOME when set', () => {
    expect(resolveCacheDir({ XDG_CACHE_HOME: '/xdg-cache' }, 'linux', home))
      .toBe(path.join('/xdg-cache', 'checkly'))
  })

  it('falls back to ~/.cache elsewhere', () => {
    expect(resolveCacheDir({}, 'linux', home)).toBe(path.join(home, '.cache', 'checkly'))
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
  it('derives the cache location from the injected env, platform and homedir', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-cache-home-'))
    try {
      const cache = TarballCache.default({}, 'linux', home)
      const putPath = await cache.put(integrity, content)
      expect(putPath.startsWith(path.join(home, '.cache', 'checkly', 'embedded-packages'))).toBe(true)
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })
})
