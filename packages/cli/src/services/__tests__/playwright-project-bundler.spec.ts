import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, it, expect } from 'vitest'

import {
  getAutoIncludes,
  getPlaywrightVersionFromPackage,
  PlaywrightProjectBundle,
  PlaywrightProjectBundler,
  resolvePlaywrightVersion,
} from '../playwright-project-bundler.js'
import { PackageManager, PNpmDetector } from '../check-parser/package-files/package-manager.js'
import { Package, Workspace } from '../check-parser/package-files/workspace.js'
import { Err, Ok } from '../check-parser/package-files/result.js'
import { Session } from '../../constructs/session.js'

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
  calls: Array<{ config: string, include: string[], workingDir?: string }> = []
  #gate?: Promise<void>

  constructor (gate?: Promise<void>) {
    super()
    this.#gate = gate
  }

  protected async bundleProject (
    config: string,
    include: string[],
    workingDir?: string,
  ): Promise<PlaywrightProjectBundle> {
    this.calls.push({ config, include, workingDir })
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

  it('bundles separately for different working directories', async () => {
    const bundler = new CountingBundler()

    await bundler.bundle('pw.config.ts', ['a/**'], 'packages/foo')
    await bundler.bundle('pw.config.ts', ['a/**'], 'packages/bar')

    expect(bundler.calls).toHaveLength(2)
  })

  it('threads the working directory through and reuses the cache for the same key', async () => {
    const bundler = new CountingBundler()

    await bundler.bundle('pw.config.ts', ['a/**'], 'packages/foo')
    await bundler.bundle('pw.config.ts', ['a/**'], 'packages/foo')

    expect(bundler.calls).toHaveLength(1)
    expect(bundler.calls[0].workingDir).toBe('packages/foo')
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

describe('resolvePlaywrightVersion()', () => {
  afterEach(() => {
    Session.reset()
  })

  // Builds a single-package project on disk with a pnpm lockfile pinning one
  // version and an *installed* node_modules pinning a different one, then wires
  // up Session as project-parser would. This reproduces a local install that
  // has drifted from the lockfile (e.g. switching branches without
  // reinstalling), where the lockfile must win over the stale install.
  async function setupProject (lockfileVersion: string, installedVersion: string): Promise<string> {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-pw-version-')),
    )

    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'project',
        version: '1.0.0',
        devDependencies: { '@playwright/test': '^1.40.0' },
      }),
    )

    await fs.writeFile(
      path.join(root, 'pnpm-lock.yaml'),
      `lockfileVersion: '9.0'\n`
      + `importers:\n`
      + `  .:\n`
      + `    devDependencies:\n`
      + `      '@playwright/test':\n`
      + `        specifier: ^1.40.0\n`
      + `        version: ${lockfileVersion}\n`,
    )

    const installedDir = path.join(root, 'node_modules', '@playwright', 'test')
    await fs.mkdir(installedDir, { recursive: true })
    await fs.writeFile(
      path.join(installedDir, 'package.json'),
      JSON.stringify({ name: '@playwright/test', version: installedVersion }),
    )

    const workspace = new Workspace({
      root: new Package({ name: 'project', path: root }),
      packages: [],
      lockfile: Ok(path.join(root, 'pnpm-lock.yaml')),
      configFile: Err(new Error('none')),
    })

    Session.packageManager = new PNpmDetector()
    Session.workspace = Ok(workspace)

    return root
  }

  it('prefers the lockfile version over the installed node_modules version', async () => {
    const root = await setupProject('1.41.0', '1.40.0')
    const version = await resolvePlaywrightVersion(root)
    expect(version).toBe('1.41.0')
  })

  it('falls back to the installed package when no workspace lockfile is available', async () => {
    // Session left at its default (no workspace), so the lockfile path is
    // skipped and we read the installed package in the cwd.
    const version = await resolvePlaywrightVersion(process.cwd())
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('resolves the enclosing member version for a nested non-declaring config package', async () => {
    // Workspace where `other-package` (holding the Playwright config) is
    // physically nested inside `some-package` and declares no @playwright/test.
    // Node resolves the version from the enclosing `some-package` (1.41.0), not
    // the root (1.40.0) — and so must we.
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-pw-nested-')),
    )
    const somePackage = path.join(root, 'packages', 'some-package')
    const otherPackage = path.join(somePackage, 'more-packages', 'other-package')
    await fs.mkdir(otherPackage, { recursive: true })

    await fs.writeFile(path.join(root, 'package.json'),
      JSON.stringify({ name: 'root', version: '1.0.0', devDependencies: { '@playwright/test': '1.40.0' } }))
    await fs.writeFile(path.join(somePackage, 'package.json'),
      JSON.stringify({ name: 'some-package', version: '1.0.0', dependencies: { '@playwright/test': '1.41.0' } }))
    await fs.writeFile(path.join(otherPackage, 'package.json'),
      JSON.stringify({ name: 'other-package', version: '1.0.0' }))

    await fs.writeFile(
      path.join(root, 'pnpm-lock.yaml'),
      `lockfileVersion: '9.0'\n`
      + `importers:\n`
      + `  .:\n`
      + `    devDependencies:\n`
      + `      '@playwright/test':\n`
      + `        specifier: 1.40.0\n`
      + `        version: 1.40.0\n`
      + `  packages/some-package:\n`
      + `    dependencies:\n`
      + `      '@playwright/test':\n`
      + `        specifier: 1.41.0\n`
      + `        version: 1.41.0\n`
      + `  packages/some-package/more-packages/other-package: {}\n`,
    )

    const workspace = new Workspace({
      root: new Package({ name: 'root', path: root }),
      packages: [
        new Package({ name: 'some-package', path: somePackage }),
        new Package({ name: 'other-package', path: otherPackage }),
      ],
      lockfile: Ok(path.join(root, 'pnpm-lock.yaml')),
      configFile: Err(new Error('none')),
    })

    Session.packageManager = new PNpmDetector()
    Session.workspace = Ok(workspace)

    const version = await resolvePlaywrightVersion(otherPackage)
    expect(version).toBe('1.41.0')
  })

  // Builds a monorepo root that owns a pnpm workspace lockfile pinning
  // `monorepoVersion`, and wires it up as Session.workspace exactly like
  // project-parser would for the checkly monorepo. Per-entry working dirs live
  // in subdirectories *below* this root; each test adds its own fixture under
  // `root` with its own self-contained lockfile. The fix must resolve each
  // fixture's own version, never collapsing to this monorepo version.
  async function setupMonorepo (monorepoVersion: string): Promise<string> {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-pw-monorepo-')),
    )

    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'monorepo',
        version: '1.0.0',
        devDependencies: { '@playwright/test': `${monorepoVersion}` },
      }),
    )

    await fs.writeFile(
      path.join(root, 'pnpm-lock.yaml'),
      `lockfileVersion: '9.0'\n`
      + `importers:\n`
      + `  .:\n`
      + `    devDependencies:\n`
      + `      '@playwright/test':\n`
      + `        specifier: ${monorepoVersion}\n`
      + `        version: ${monorepoVersion}\n`,
    )

    const workspace = new Workspace({
      root: new Package({ name: 'monorepo', path: root }),
      packages: [],
      lockfile: Ok(path.join(root, 'pnpm-lock.yaml')),
      configFile: Err(new Error('none')),
    })

    Session.packageManager = new PNpmDetector()
    Session.workspace = Ok(workspace)

    return root
  }

  it('resolves a self-contained fixture from its own (yarn) lockfile, not the monorepo lockfile', async () => {
    // The monorepo pins 1.40.0; a per-entry workingDir fixture has its OWN
    // yarn.lock + package.json pinning 1.49.0. The fixture's lockfile is the
    // source of truth for that entry — note the fixture even uses a *different*
    // package manager (yarn) than the monorepo (pnpm), so we must detect the
    // fixture's package manager rather than reuse Session.packageManager.
    const root = await setupMonorepo('1.40.0')

    const fixtureDir = path.join(root, 'fixtures', 'yarn-app')
    await fs.mkdir(fixtureDir, { recursive: true })

    await fs.writeFile(
      path.join(fixtureDir, 'package.json'),
      JSON.stringify({
        name: 'yarn-app',
        version: '1.0.0',
        devDependencies: { '@playwright/test': '^1.49.0' },
      }),
    )

    // yarn classic lockfile pinning 1.49.0.
    await fs.writeFile(
      path.join(fixtureDir, 'yarn.lock'),
      `"@playwright/test@^1.49.0":\n`
      + `  version "1.49.0"\n`
      + `  resolved "https://registry.yarnpkg.com/@playwright/test/-/test-1.49.0.tgz"\n`,
    )

    const version = await resolvePlaywrightVersion(fixtureDir)
    expect(version).toBe('1.49.0')
  })

  it('resolves a pnpm workspace-member fixture from the lockfile above the workingDir, not the monorepo lockfile', async () => {
    // The trap: the workingDir points at a workspace MEMBER subdir whose own
    // lockfile lives at the fixture's workspace root ABOVE it (the member has
    // no lockfile of its own). The search must walk UP from the workingDir to
    // that fixture workspace lockfile (pinning 1.49.0) — but stop before the
    // monorepo lockfile (pinning 1.40.0).
    const root = await setupMonorepo('1.40.0')

    const fixtureWorkspaceRoot = path.join(root, 'fixtures', 'pnpm-ws')
    const memberDir = path.join(fixtureWorkspaceRoot, 'packages', 'member')
    await fs.mkdir(memberDir, { recursive: true })

    await fs.writeFile(
      path.join(fixtureWorkspaceRoot, 'package.json'),
      JSON.stringify({ name: 'pnpm-ws', version: '1.0.0' }),
    )
    await fs.writeFile(
      path.join(fixtureWorkspaceRoot, 'pnpm-workspace.yaml'),
      `packages:\n  - 'packages/*'\n`,
    )
    await fs.writeFile(
      path.join(memberDir, 'package.json'),
      JSON.stringify({
        name: 'member',
        version: '1.0.0',
        devDependencies: { '@playwright/test': '^1.49.0' },
      }),
    )

    // The fixture workspace lockfile records the member importer relative to
    // the fixture workspace root (packages/member), pinning 1.49.0.
    await fs.writeFile(
      path.join(fixtureWorkspaceRoot, 'pnpm-lock.yaml'),
      `lockfileVersion: '9.0'\n`
      + `importers:\n`
      + `  .: {}\n`
      + `  packages/member:\n`
      + `    devDependencies:\n`
      + `      '@playwright/test':\n`
      + `        specifier: ^1.49.0\n`
      + `        version: 1.49.0\n`,
    )

    const version = await resolvePlaywrightVersion(memberDir)
    expect(version).toBe('1.49.0')
  })

  it('falls back to the monorepo workspace lockfile when the entry has no fixture-local lockfile', async () => {
    // No regression: a workingDir whose nearest lockfile walking up IS the
    // monorepo lockfile must resolve the monorepo version. The fixture-local
    // search must NOT cross into / use the monorepo lockfile, so it finds
    // nothing and the existing Session.workspace path resolves 1.40.0.
    const root = await setupMonorepo('1.40.0')

    const entryDir = path.join(root, 'apps', 'no-lockfile-entry')
    await fs.mkdir(entryDir, { recursive: true })
    await fs.writeFile(
      path.join(entryDir, 'package.json'),
      JSON.stringify({ name: 'no-lockfile-entry', version: '1.0.0' }),
    )

    const version = await resolvePlaywrightVersion(entryDir)
    expect(version).toBe('1.40.0')
  })
})
