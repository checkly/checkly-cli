import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { DetectionCache, detectionInputDigest, verdictKey } from '../detection-cache.js'
import { parseNpmrc } from '../npmrc.js'

describe('detectionInputDigest()', () => {
  const lockfile = `lockfileVersion: '9.0'\npackages: {}\n`

  it('is stable for identical inputs', () => {
    const config = parseNpmrc('registry=https://nexus.local/npm/')
    expect(detectionInputDigest(lockfile, config)).toBe(detectionInputDigest(lockfile, config))
  })

  it('changes when the lockfile changes', () => {
    const config = parseNpmrc('registry=https://nexus.local/npm/')
    expect(detectionInputDigest(lockfile, config)).not.toBe(detectionInputDigest(`${lockfile}#`, config))
  })

  it('changes when registry configuration changes', () => {
    const a = parseNpmrc('registry=https://nexus.local/npm/')
    const b = parseNpmrc('@acme:registry=https://nexus.local/npm-private/')
    expect(detectionInputDigest(lockfile, a)).not.toBe(detectionInputDigest(lockfile, b))
  })

  it('changes when the detection fallback mode changes', () => {
    // A summary derived with graph assumptions under 'public-registry'
    // must not be served after the option is set back to 'skip'.
    const config = parseNpmrc('registry=https://nexus.local/npm/')
    expect(detectionInputDigest(lockfile, config, {}, [], 'public-registry'))
      .not.toBe(detectionInputDigest(lockfile, config, {}, [], 'skip'))
    expect(detectionInputDigest(lockfile, config, {}, [], 'skip'))
      .toBe(detectionInputDigest(lockfile, config, {}, []))
  })

  it('changes when a ${VAR}-referenced registry value changes', () => {
    const config = parseNpmrc('registry=${MY_REGISTRY}')
    expect(detectionInputDigest(lockfile, config, { MY_REGISTRY: 'https://a.example.com/' }))
      .not.toBe(detectionInputDigest(lockfile, config, { MY_REGISTRY: 'https://b.example.com/' }))
  })

  it('changes when a credential rotated behind a ${VAR} reference changes', () => {
    const config = parseNpmrc([
      'registry=https://nexus.local/npm/',
      '//nexus.local/npm/:_authToken=${NPM_TOKEN}',
    ].join('\n'))
    expect(detectionInputDigest(lockfile, config, { NPM_TOKEN: 'token-a' }))
      .not.toBe(detectionInputDigest(lockfile, config, { NPM_TOKEN: 'token-b' }))
  })

  it('changes when registry credentials change', () => {
    // The registry API filters what it shows by permission, so verdicts
    // must not outlive a credentials change.
    const a = parseNpmrc('registry=https://nexus.local/npm/')
    const b = parseNpmrc([
      'registry=https://nexus.local/npm/',
      '//nexus.local/npm/:_authToken=secret',
    ].join('\n'))
    expect(detectionInputDigest(lockfile, a)).not.toBe(detectionInputDigest(lockfile, b))
  })

  it('ignores npm configuration unrelated to registries or credentials', () => {
    const a = parseNpmrc('registry=https://nexus.local/npm/')
    const b = parseNpmrc([
      'registry=https://nexus.local/npm/',
      'strict-ssl=false',
    ].join('\n'))
    expect(detectionInputDigest(lockfile, a)).toBe(detectionInputDigest(lockfile, b))
  })
})

describe('DetectionCache', () => {
  let dir: string
  let cache: DetectionCache

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-detection-cache-'))
    cache = new DetectionCache(dir)
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('round-trips a summary by input digest', async () => {
    const embedKeys = [verdictKey({ name: '@acme/foo', version: '1.2.3', integrity: 'sha512-aaa' })]
    await expect(cache.getSummary('digest-1')).resolves.toBeUndefined()
    await cache.putSummary('digest-1', { embedKeys })
    await expect(cache.getSummary('digest-1')).resolves.toEqual({ embedKeys })
    await expect(cache.getSummary('digest-2')).resolves.toBeUndefined()
  })

  it('treats a structurally wrong summary as a miss', async () => {
    await cache.putSummary('digest-1', { embedKeys: [] })
    const [file] = (await fs.readdir(dir)).filter(name => name.startsWith('summary-'))
    await fs.writeFile(path.join(dir, file), JSON.stringify({ embedKeys: 'not-an-array' }))
    await expect(cache.getSummary('digest-1')).resolves.toBeUndefined()
  })

  it('merges verdicts across writes', async () => {
    const entryA = { name: 'a', version: '1.0.0', integrity: 'sha512-aaa' }
    const entryB = { name: 'b', version: '2.0.0', integrity: 'sha512-bbb' }
    await cache.putVerdicts({ [verdictKey(entryA)]: 'embed' })
    await cache.putVerdicts({ [verdictKey(entryB)]: 'public' })
    await expect(cache.getVerdicts()).resolves.toEqual({
      [verdictKey(entryA)]: 'embed',
      [verdictKey(entryB)]: 'public',
    })
  })

  it('merges verdicts from every cache root, primary root winning', async () => {
    const primary = path.join(dir, 'primary')
    const fallback = path.join(dir, 'fallback')
    const primaryCache = new DetectionCache(primary)
    const fallbackCache = new DetectionCache(fallback)
    const entryA = { name: 'a', version: '1.0.0', integrity: 'sha512-aaa' }
    const entryB = { name: 'b', version: '2.0.0', integrity: 'sha512-bbb' }
    await primaryCache.putVerdicts({ [verdictKey(entryA)]: 'embed' })
    // Overlapping key: the fallback disagrees about entryA — the primary
    // root must win.
    await fallbackCache.putVerdicts({ [verdictKey(entryA)]: 'public', [verdictKey(entryB)]: 'public' })

    const multi = new DetectionCache([primary, fallback])
    await expect(multi.getVerdicts()).resolves.toEqual({
      [verdictKey(entryA)]: 'embed',
      [verdictKey(entryB)]: 'public',
    })
  })

  it('bounds the verdict map, keeping the freshest entries beyond the cap', async () => {
    const bulk = Object.fromEntries(
      Array.from({ length: 10_001 }, (_, i) => [`pkg-${i}@1.0.0::sha512-x`, 'public' as const]),
    )
    await cache.putVerdicts(bulk)
    const fresh = { 'fresh@1.0.0::sha512-y': 'embed' as const }
    await cache.putVerdicts(fresh)
    await expect(cache.getVerdicts()).resolves.toEqual(fresh)
  })

  it('prunes summaries beyond the retention count', async () => {
    for (let i = 0; i < 15; i++) {
      // Hex digests, as detectionInputDigest produces.
      await cache.putSummary(`abcdef${i.toString(16).padStart(2, '0')}`, { embedKeys: [] })
    }
    const files = (await fs.readdir(dir)).filter(name => name.startsWith('summary-'))
    expect(files.length).toBeLessThanOrEqual(10)
  })

  it('prunes only strictly older verdict files on write, keeping newer CLIs\' files', async () => {
    await fs.writeFile(path.join(dir, 'verdicts-v1.json'), '{}')
    await fs.writeFile(path.join(dir, 'verdicts-v99.json'), '{}')
    await cache.putVerdicts({ 'a@1.0.0::sha512-aaa': 'embed' })
    const names = await fs.readdir(dir)
    expect(names).not.toContain('verdicts-v1.json')
    // A newer CLI sharing this cache root must not have its file deleted.
    expect(names).toContain('verdicts-v99.json')
    // The verdict file's version (2) is decoupled from DETECTOR_VERSION
    // (3): a summary-semantics bump must not discard integrity proofs,
    // which for opted-in users would mean re-sending private package
    // names to the public registry. The literal filename pins that.
    expect(names).toContain('verdicts-v2.json')
  })

  it('treats corrupt cache files as misses', async () => {
    await cache.putSummary('digest-1', { embedKeys: [] })
    const [file] = (await fs.readdir(dir)).filter(name => name.startsWith('summary-'))
    await fs.writeFile(path.join(dir, file), 'not json')
    await expect(cache.getSummary('digest-1')).resolves.toBeUndefined()
  })
})
