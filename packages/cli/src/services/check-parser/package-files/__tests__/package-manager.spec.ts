import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CNpmDetector,
  detectNearestConfigFiles,
  detectNearestLockfiles,
  detectPackageManager,
  knownPackageManagers,
  NoConfigFileFoundError,
  NoLockfileFoundError,
  NpmDetector,
  npmPackageManager,
  PackageManagerDetector,
  YarnDetector,
} from '../package-manager.js'

// Detection consults, in order: the npm_config_user_agent env var, the JS
// runtime, lockfiles, config files, and finally executables on PATH. The
// env var and runtime describe how the CLI was *launched*, not what the
// project uses, so these tests verify that a project's lockfile — when one
// exists — wins over those ambient signals, while behavior is unchanged when
// no lockfile exists.
describe('detectPackageManager', () => {
  // Restricting the detector set keeps tests hermetic: it excludes the
  // bun/deno detectors (whose detectRuntime() reads process.versions and could
  // fire under an exotic test runner) and bounds which package managers the
  // executable-on-PATH fallback can ever return.
  // Returns the detectors named, in the exact order requested. Detection
  // precedence is governed by each detector's priority(method), not by input
  // order, so several tests pass the same detectors in different orders to prove
  // the result is identical.
  const detectorsNamed = (...names: string[]): PackageManagerDetector[] =>
    names.map(name => {
      const detector = knownPackageManagers.find(candidate => candidate.name === name)
      if (detector === undefined) {
        throw new Error(`No known package manager detector named ${name}`)
      }
      return detector
    })

  const pnpmNpm = detectorsNamed('pnpm', 'npm')
  const pnpmYarnNpm = detectorsNamed('pnpm', 'yarn', 'npm')

  const tmpDirs: string[] = []
  let savedUserAgent: string | undefined

  beforeEach(() => {
    savedUserAgent = process.env['npm_config_user_agent']
  })

  afterEach(async () => {
    setUserAgent(savedUserAgent)
    vi.restoreAllMocks()
    await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
  })

  function setUserAgent (userAgent: string | undefined): void {
    if (userAgent === undefined) {
      delete process.env['npm_config_user_agent']
    } else {
      process.env['npm_config_user_agent'] = userAgent
    }
  }

  // Builds an isolated temp directory tree containing the given files (keyed by
  // relative path, with their contents as values — lockfiles only need to
  // exist, so the content is irrelevant). Returns the realpath'd root so the
  // `root` option, which bounds the lineage walk via a string comparison,
  // terminates correctly on macOS (/var -> /private/var).
  async function makeTree (files: Record<string, string>): Promise<string> {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-pm-spec-')),
    )
    tmpDirs.push(root)

    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = path.join(root, relativePath)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, content)
    }

    return root
  }

  describe('lockfile wins over ambient signals', () => {
    it('prefers the project lockfile over an npm user agent (npx in a pnpm repo)', async () => {
      // The headline bug: a pnpm project invoked via `npx checkly` reports an
      // npm user agent but must still resolve to pnpm.
      setUserAgent('npm/10.0.0 node/v20.19.0')
      const root = await makeTree({ 'pnpm-lock.yaml': '' })

      const pm = await detectPackageManager(root, { detectors: pnpmNpm, root })

      expect(pm.name).toBe('pnpm')
    })

    it('prefers the project lockfile over a pnpm user agent (CLI run under pnpm)', async () => {
      // The internal-tests bug: `pnpm vitest` leaks a pnpm user agent into the
      // CLI process, but a fixture with an npm lockfile must resolve to npm.
      setUserAgent('pnpm/8.0.0 node/v20.19.0')
      const root = await makeTree({ 'package-lock.json': '' })

      const pm = await detectPackageManager(root, { detectors: pnpmNpm, root })

      expect(pm.name).toBe('npm')
    })

    it('returns the package manager when user agent and lockfile agree', async () => {
      setUserAgent('pnpm/8.0.0 node/v20.19.0')
      const root = await makeTree({ 'pnpm-lock.yaml': '' })

      const pm = await detectPackageManager(root, { detectors: pnpmNpm, root })

      expect(pm.name).toBe('pnpm')
    })

    it('detects yarn from yarn.lock despite an npm user agent', async () => {
      setUserAgent('npm/10.0.0 node/v20.19.0')
      const root = await makeTree({ 'yarn.lock': '' })

      const pm = await detectPackageManager(root, { detectors: pnpmYarnNpm, root })

      expect(pm.name).toBe('yarn')
    })
  })

  describe('no lockfile falls back to ambient detection', () => {
    it('falls back to the user agent when no lockfile exists', async () => {
      setUserAgent('yarn/1.22.0 node/v20.19.0')
      const root = await makeTree({})

      const pm = await detectPackageManager(root, { detectors: pnpmYarnNpm, root })

      expect(pm.name).toBe('yarn')
    })

    it('falls back to config file detection when there is no lockfile and no user agent', async () => {
      setUserAgent(undefined)
      const root = await makeTree({ 'pnpm-workspace.yaml': '' })

      const pm = await detectPackageManager(root, { detectors: pnpmNpm, root })

      expect(pm.name).toBe('pnpm')
    })

    it('breaks a co-located config-file tie by priority regardless of detector order', async () => {
      // Two config files in the same directory: the higher-priority detector
      // (pnpm 60 > deno 40) wins whichever order detectors are supplied in.
      setUserAgent(undefined)
      const root = await makeTree({ 'pnpm-workspace.yaml': '', 'deno.json': '' })

      const denoFirst = await detectPackageManager(root, { detectors: detectorsNamed('deno', 'pnpm'), root })
      expect(denoFirst.name).toBe('pnpm')

      const pnpmFirst = await detectPackageManager(root, { detectors: detectorsNamed('pnpm', 'deno'), root })
      expect(pnpmFirst.name).toBe('pnpm')
    })

    it('keeps the user agent ahead of a config file when there is no lockfile', async () => {
      // A config file is a weaker signal than the user agent; with no lockfile
      // to override it, the npm user agent still wins over pnpm-workspace.yaml.
      setUserAgent('npm/10.0.0 node/v20.19.0')
      const root = await makeTree({ 'pnpm-workspace.yaml': '' })

      const pm = await detectPackageManager(root, { detectors: pnpmNpm, root })

      expect(pm.name).toBe('npm')
    })

    it('falls back to npm when nothing matches', async () => {
      // Restricting detectors to npm makes the result deterministic regardless
      // of which package managers are installed on PATH.
      setUserAgent(undefined)
      const root = await makeTree({})

      const pm = await detectPackageManager(root, { detectors: [npmPackageManager], root })

      expect(pm.name).toBe('npm')
    })
  })

  describe('lineage walking', () => {
    it('finds a lockfile in a parent directory', async () => {
      setUserAgent(undefined)
      const root = await makeTree({
        'pnpm-lock.yaml': '',
        'sub/package.json': '{}',
      })

      const pm = await detectPackageManager(path.join(root, 'sub'), { detectors: pnpmNpm, root })

      expect(pm.name).toBe('pnpm')
    })

    it('prefers the nearest directory lockfile over a farther one', async () => {
      // A npm lockfile in the start directory wins over a pnpm lockfile in a
      // parent, even when the user agent points at pnpm: the nearest directory
      // containing any lockfile decides.
      setUserAgent('pnpm/8.0.0 node/v20.19.0')
      const root = await makeTree({
        'pnpm-lock.yaml': '',
        'sub/package-lock.json': '',
      })

      const pm = await detectPackageManager(path.join(root, 'sub'), { detectors: pnpmNpm, root })

      expect(pm.name).toBe('npm')
    })

    it('stops at the root directory and does not escape into ancestors', async () => {
      // The lockfile lives above `root`, so the bounded walk must not find it
      // and detection falls back to the user agent.
      setUserAgent('yarn/1.22.0 node/v20.19.0')
      const outer = await makeTree({ 'pnpm-lock.yaml': '' })
      const inner = path.join(outer, 'project')
      await fs.mkdir(inner, { recursive: true })

      const pm = await detectPackageManager(inner, { detectors: pnpmYarnNpm, root: inner })

      expect(pm.name).toBe('yarn')
    })
  })

  describe('multiple lockfiles in the same directory', () => {
    it('lets the user agent break the tie', async () => {
      setUserAgent('pnpm/8.0.0 node/v20.19.0')
      const root = await makeTree({
        'pnpm-lock.yaml': '',
        'package-lock.json': '',
      })

      const pm = await detectPackageManager(root, { detectors: pnpmNpm, root })

      expect(pm.name).toBe('pnpm')
    })

    it('honors the same tie the other way for an npm user agent', async () => {
      setUserAgent('npm/10.0.0 node/v20.19.0')
      const root = await makeTree({
        'pnpm-lock.yaml': '',
        'package-lock.json': '',
      })

      const pm = await detectPackageManager(root, { detectors: pnpmNpm, root })

      expect(pm.name).toBe('npm')
    })

    it('breaks the tie by priority regardless of detector input order', async () => {
      // With no user agent and two co-located lockfiles, the higher-priority
      // detector (pnpm 60 > npm 20) wins no matter the order detectors are
      // supplied in — input order does not affect the result.
      setUserAgent(undefined)
      const root = await makeTree({
        'pnpm-lock.yaml': '',
        'package-lock.json': '',
      })

      const npmFirst = await detectPackageManager(root, { detectors: detectorsNamed('npm', 'pnpm'), root })
      expect(npmFirst.name).toBe('pnpm')

      const pnpmFirst = await detectPackageManager(root, { detectors: detectorsNamed('pnpm', 'npm'), root })
      expect(pnpmFirst.name).toBe('pnpm')
    })
  })

  describe('runtime detection is gated the same way as the user agent', () => {
    // Force a detector's runtime check on so the runtime branch is exercised
    // without depending on the actual JS runtime the tests run under.
    function yarnWithRuntime (): YarnDetector {
      const detector = new YarnDetector()
      vi.spyOn(detector, 'detectRuntime').mockReturnValue(true)
      return detector
    }

    it('prefers the project lockfile over the detected runtime', async () => {
      setUserAgent(undefined)
      const root = await makeTree({ 'package-lock.json': '' })

      const pm = await detectPackageManager(root, {
        detectors: [yarnWithRuntime(), npmPackageManager],
        root,
      })

      expect(pm.name).toBe('npm')
    })

    it('uses the runtime package manager when it is backed by a lockfile', async () => {
      setUserAgent(undefined)
      const root = await makeTree({ 'yarn.lock': '' })

      const pm = await detectPackageManager(root, {
        detectors: [yarnWithRuntime(), npmPackageManager],
        root,
      })

      expect(pm.name).toBe('yarn')
    })

    it('falls back to the runtime when no lockfile exists', async () => {
      setUserAgent(undefined)
      const root = await makeTree({})

      const pm = await detectPackageManager(root, {
        detectors: [yarnWithRuntime(), npmPackageManager],
        root,
      })

      expect(pm.name).toBe('yarn')
    })
  })

  describe('executable on PATH fallback', () => {
    // The executable tier only runs when no lockfile, user agent, runtime, or
    // config file resolves. Spy on detectExecutable to keep it off the real
    // PATH and make the outcome deterministic.
    it('uses an executable on PATH as a last resort before npm', async () => {
      setUserAgent(undefined)
      const root = await makeTree({})
      const yarn = new YarnDetector()
      vi.spyOn(yarn, 'detectExecutable').mockResolvedValue(undefined)

      const pm = await detectPackageManager(root, { detectors: [yarn], root })

      expect(pm.name).toBe('yarn')
    })

    it('returns npm when even executable detection finds nothing', async () => {
      // Exercises the ultimate `return npmPackageManager` fallback.
      setUserAgent(undefined)
      const root = await makeTree({})
      const yarn = new YarnDetector()
      vi.spyOn(yarn, 'detectExecutable').mockRejectedValue(new Error('not on PATH'))

      const pm = await detectPackageManager(root, { detectors: [yarn], root })

      expect(pm.name).toBe('npm')
    })

    it('prefers an installed cnpm over npm because npm is deprioritized for executables', async () => {
      // npm is almost always on PATH, so its presence is no signal: with both
      // cnpm and npm installed and nothing else to go on, cnpm wins.
      setUserAgent(undefined)
      const root = await makeTree({})
      const npm = new NpmDetector()
      const cnpm = new CNpmDetector()
      vi.spyOn(npm, 'detectExecutable').mockResolvedValue(undefined)
      vi.spyOn(cnpm, 'detectExecutable').mockResolvedValue(undefined)

      const pm = await detectPackageManager(root, { detectors: [npm, cnpm], root })

      expect(pm.name).toBe('cnpm')
    })

    it('still selects npm when it is the only executable present', async () => {
      setUserAgent(undefined)
      const root = await makeTree({})
      const npm = new NpmDetector()
      const cnpm = new CNpmDetector()
      vi.spyOn(npm, 'detectExecutable').mockResolvedValue(undefined)
      vi.spyOn(cnpm, 'detectExecutable').mockRejectedValue(new Error('not on PATH'))

      const pm = await detectPackageManager(root, { detectors: [npm, cnpm], root })

      expect(pm.name).toBe('npm')
    })
  })

  describe('user agent edge cases', () => {
    it('ignores a user agent that matches no known detector', async () => {
      // A bun user agent with bun excluded from the detector set must not
      // prevent the npm lockfile from being detected.
      setUserAgent('bun/1.1.0 node/v20.19.0')
      const root = await makeTree({ 'package-lock.json': '' })

      const pm = await detectPackageManager(root, { detectors: pnpmNpm, root })

      expect(pm.name).toBe('npm')
    })
  })

  describe('cnpm (shares npm\'s package-lock.json)', () => {
    const cnpmNpm = detectorsNamed('cnpm', 'npm')

    it('detects cnpm from the user agent when no lockfile exists', async () => {
      setUserAgent('npminstall/7.0.0 node/v20.19.0')
      const root = await makeTree({})

      const pm = await detectPackageManager(root, { detectors: cnpmNpm, root })

      expect(pm.name).toBe('cnpm')
    })

    it('detects cnpm when its user agent and a package-lock.json are both present', async () => {
      // cnpm claims package-lock.json, so the cnpm user agent is now
      // lockfile-backed and wins over the bare lockfile.
      setUserAgent('npminstall/7.0.0 node/v20.19.0')
      const root = await makeTree({ 'package-lock.json': '' })

      const pm = await detectPackageManager(root, { detectors: cnpmNpm, root })

      expect(pm.name).toBe('cnpm')
    })

    it('defaults a bare package-lock.json to npm, not cnpm, regardless of detector order', async () => {
      // No cnpm user agent: npm has a higher lockfile priority (20) than cnpm
      // (10), so a plain package-lock.json resolves to npm whichever order the
      // detectors are supplied in, and with the full default set.
      setUserAgent(undefined)
      const root = await makeTree({ 'package-lock.json': '' })

      const npmFirst = await detectPackageManager(root, { detectors: detectorsNamed('npm', 'cnpm'), root })
      expect(npmFirst.name).toBe('npm')

      const cnpmFirst = await detectPackageManager(root, { detectors: detectorsNamed('cnpm', 'npm'), root })
      expect(cnpmFirst.name).toBe('npm')

      const defaultSet = await detectPackageManager(root)
      expect(defaultSet.name).toBe('npm')
    })

    it('keeps an npm user agent resolving to npm despite the shared lockfile', async () => {
      setUserAgent('npm/10.0.0 node/v20.19.0')
      const root = await makeTree({ 'package-lock.json': '' })

      const pm = await detectPackageManager(root, { detectors: cnpmNpm, root })

      expect(pm.name).toBe('npm')
    })

    it('does not mis-detect cnpm in a pnpm project (no cross-PM regression)', async () => {
      // Running cnpm inside a pnpm repo: there's no package-lock.json to back
      // the cnpm user agent, so the pnpm lockfile still wins.
      setUserAgent('npminstall/7.0.0 node/v20.19.0')
      const root = await makeTree({ 'pnpm-lock.yaml': '' })

      const pm = await detectPackageManager(root, {
        detectors: detectorsNamed('cnpm', 'pnpm', 'npm'),
        root,
      })

      expect(pm.name).toBe('pnpm')
    })
  })

  describe('default detector set', () => {
    it('uses all known package managers when no options are provided', async () => {
      // No detectors and no root: exercises the `?? knownPackageManagers`
      // default. The lockfile sits in the start directory, so the unbounded
      // lineage walk resolves it immediately without escaping into ancestors.
      setUserAgent('npm/10.0.0 node/v20.19.0')
      const root = await makeTree({ 'pnpm-lock.yaml': '' })

      const pm = await detectPackageManager(root)

      expect(pm.name).toBe('pnpm')
    })
  })
})

describe('detectNearestLockfiles', () => {
  const tmpDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
  })

  async function makeTree (files: Record<string, string>): Promise<string> {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-pm-all-spec-')),
    )
    tmpDirs.push(root)

    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = path.join(root, relativePath)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, content)
    }

    return root
  }

  const pnpmNpm = knownPackageManagers.filter(detector => ['pnpm', 'npm'].includes(detector.name))

  it('returns every lockfile found in the nearest directory that has one', async () => {
    const root = await makeTree({
      'pnpm-lock.yaml': '',
      'package-lock.json': '',
    })

    const results = await detectNearestLockfiles(root, { detectors: pnpmNpm, root })

    expect(results.map(result => result.packageManager.name).sort()).toEqual(['npm', 'pnpm'])
  })

  it('stops at the nearest directory and does not collect from ancestors', async () => {
    const root = await makeTree({
      'pnpm-lock.yaml': '',
      'sub/package-lock.json': '',
    })

    const results = await detectNearestLockfiles(path.join(root, 'sub'), { detectors: pnpmNpm, root })

    expect(results.map(result => result.packageManager.name)).toEqual(['npm'])
  })

  it('throws NoLockfileFoundError when no lockfile exists in the lineage', async () => {
    const root = await makeTree({})

    await expect(detectNearestLockfiles(root, { detectors: pnpmNpm, root }))
      .rejects.toBeInstanceOf(NoLockfileFoundError)
  })
})

describe('detectNearestConfigFiles', () => {
  const tmpDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
  })

  async function makeTree (files: Record<string, string>): Promise<string> {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-pm-config-spec-')),
    )
    tmpDirs.push(root)

    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = path.join(root, relativePath)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, content)
    }

    return root
  }

  const pnpmDeno = knownPackageManagers.filter(detector => ['pnpm', 'deno'].includes(detector.name))

  it('returns every config file found in the nearest directory that has one', async () => {
    const root = await makeTree({
      'pnpm-workspace.yaml': '',
      'deno.json': '',
    })

    const results = await detectNearestConfigFiles(root, { detectors: pnpmDeno, root })

    expect(results.map(result => result.packageManager.name).sort()).toEqual(['deno', 'pnpm'])
  })

  it('stops at the nearest directory and does not collect from ancestors', async () => {
    const root = await makeTree({
      'pnpm-workspace.yaml': '',
      'sub/deno.json': '',
    })

    const results = await detectNearestConfigFiles(path.join(root, 'sub'), { detectors: pnpmDeno, root })

    expect(results.map(result => result.packageManager.name)).toEqual(['deno'])
  })

  it('throws NoConfigFileFoundError when no config file exists in the lineage', async () => {
    const root = await makeTree({})

    await expect(detectNearestConfigFiles(root, { detectors: pnpmDeno, root }))
      .rejects.toBeInstanceOf(NoConfigFileFoundError)
  })
})
