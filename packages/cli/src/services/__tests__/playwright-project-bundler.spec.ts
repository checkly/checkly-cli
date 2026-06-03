import path from 'node:path'
import { describe, it, expect } from 'vitest'

import {
  getAutoIncludes,
  getPlaywrightVersionFromPackage,
  PlaywrightProjectBundle,
  PlaywrightProjectBundler,
} from '../playwright-project-bundler.js'
import { PackageManager } from '../check-parser/package-files/package-manager.js'

// A promise we can resolve from the outside, to hold a bundle "in flight"
// while we issue concurrent calls — keeps the dedup test deterministic.
function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

// Subclass that stubs the real bundling so we can count how many times it runs
// and control its timing, without needing a full Session/filesystem setup.
class CountingBundler extends PlaywrightProjectBundler {
  calls: Array<{ config: string, include: string[] }> = []
  #gate?: Promise<void>

  constructor (gate?: Promise<void>) {
    super()
    this.#gate = gate
  }

  protected async bundleProject (config: string, include: string[]): Promise<PlaywrightProjectBundle> {
    this.calls.push({ config, include })
    if (this.#gate) {
      await this.#gate
    }
    return {
      browsers: [],
      relativePlaywrightConfigPath: config,
      playwrightVersion: '1.0.0',
      files: [],
    }
  }
}

describe('PlaywrightProjectBundler cache', () => {
  it('runs the bundle once for concurrent calls with the same config and include', async () => {
    const gate = deferred<void>()
    const bundler = new CountingBundler(gate.promise)

    const results = Promise.all([
      bundler.bundle('pw.config.ts', ['a/**']),
      bundler.bundle('pw.config.ts', ['a/**']),
      bundler.bundle('pw.config.ts', ['a/**']),
    ])

    gate.resolve()
    await results

    expect(bundler.calls).toHaveLength(1)
  })

  it('reuses the cached result on sequential calls with the same key', async () => {
    const bundler = new CountingBundler()

    const first = await bundler.bundle('pw.config.ts', ['a/**'])
    const second = await bundler.bundle('pw.config.ts', ['a/**'])

    expect(bundler.calls).toHaveLength(1)
    // Same resolved object is shared across callers.
    expect(second).toBe(first)
  })

  it('bundles separately for different include patterns', async () => {
    const bundler = new CountingBundler()

    await bundler.bundle('pw.config.ts', ['a/**'])
    await bundler.bundle('pw.config.ts', ['b/**'])

    expect(bundler.calls).toHaveLength(2)
  })

  it('bundles separately for different config paths', async () => {
    const bundler = new CountingBundler()

    await bundler.bundle('a/pw.config.ts', [])
    await bundler.bundle('b/pw.config.ts', [])

    expect(bundler.calls).toHaveLength(2)
  })
})

describe('getAutoIncludes()', () => {
  const basePath = path.resolve('/project')
  const makePm = (name: string): PackageManager => ({
    name,
    representativeLockfiles: [],
    representativeConfigFile: undefined,
    installCommand: () => ({ executable: name, args: ['install'], unsafeDisplayCommand: `${name} install` }),
    execCommand: (args: string[]) => ({ executable: name, args, unsafeDisplayCommand: `${name} ${args.join(' ')}` }),
    lookupWorkspace: () => Promise.resolve(undefined),
    detector: () => ({}) as any,
  })

  it('should return patches/*.patch for pnpm', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('pnpm'), [])
    expect(result).toEqual(['patches/*.patch'])
  })

  it('should return empty for npm', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('npm'), [])
    expect(result).toEqual([])
  })

  it('should return empty for yarn', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('yarn'), [])
    expect(result).toEqual([])
  })

  it('should skip when user already includes patches/*.patch', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('pnpm'), ['patches/*.patch'])
    expect(result).toEqual([])
  })

  it('should skip when user already includes a patches/ subpath', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('pnpm'), ['patches/some-patch.patch'])
    expect(result).toEqual([])
  })

  it('should skip when user includes ./patches/**', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('pnpm'), ['./patches/**'])
    expect(result).toEqual([])
  })

  it('should skip when user includes absolute patches path', () => {
    const result = getAutoIncludes(basePath, basePath, makePm('pnpm'), [path.join(basePath, 'patches/**')])
    expect(result).toEqual([])
  })

  it('should return relative pattern when globCwd is a subdirectory', () => {
    const globCwd = path.resolve('/project/packages/app')
    const result = getAutoIncludes(basePath, globCwd, makePm('pnpm'), [])
    expect(result).toEqual(['../../patches/*.patch'])
  })

  it('should detect alreadyIncluded when patterns are relative to globCwd', () => {
    const globCwd = path.resolve('/project/packages/app')
    const result = getAutoIncludes(basePath, globCwd, makePm('pnpm'), ['../../patches/foo.patch'])
    expect(result).toEqual([])
  })
})

describe('getPlaywrightVersionFromPackage()', () => {
  it('should throw error when playwright package is not found', async () => {
    const nonExistentDir = '/tmp/non-existent-dir'
    await expect(getPlaywrightVersionFromPackage(nonExistentDir)).rejects.toThrow()
  })

  it('should get version from installed playwright package', async () => {
    // Use the current working directory which should have playwright installed
    const currentDir = process.cwd()
    const version = await getPlaywrightVersionFromPackage(currentDir)

    // Should return a valid semver version
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
