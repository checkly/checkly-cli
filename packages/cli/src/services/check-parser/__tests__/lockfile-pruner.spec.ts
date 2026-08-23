import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, afterAll, vi } from 'vitest'

import {
  pruneBundledLockfile,
  selectMaterializationEntries,
  shouldPruneLockfile,
} from '../lockfile-pruner.js'
import { createFauxPackageFiles } from '../faux-package.js'
import { BunDetector, NpmDetector, PackageManager, PNpmDetector, Runnable } from '../package-files/package-manager.js'
import { Package, Workspace } from '../package-files/workspace.js'
import { Err, Ok } from '../package-files/result.js'
import { File } from '../parser.js'

const PNPM_FIXTURE_ROOT = path.join(__dirname, 'lockfile-pruner-fixtures', 'pnpm-workspace')
const NPM_FIXTURE_ROOT = path.join(__dirname, 'lockfile-pruner-fixtures', 'npm-workspace')
const BUN_FIXTURE_ROOT = path.join(__dirname, 'lockfile-pruner-fixtures', 'bun-workspace')

// Unlike pnpm and npm, bun is not part of the repo's own toolchain, so the
// tests that run a real bun install skip themselves when it is not on PATH.
// A dedicated CI-only test asserts that bun IS provisioned there, so losing
// the provisioning step fails the job with a self-describing message
// instead of silently removing the coverage.
const bunAvailable = spawnSync('bun', ['--version']).status === 0

// Generates a stub package-manager script that rewrites the materialized
// bun.lock through string replacements — bun.lock is JSONC with trailing
// commas, which node's JSON.parse rejects, and the prune temp dir has no
// node_modules to load a JSON5 parser from. A search string that no longer
// matches (e.g. after a fixture change) fails the script rather than
// silently leaving the lockfile unmodified, which would let some tests
// pass vacuously.
const rewriteBunLockScript = (...replacements: Array<[string, string]>): string => `
  const fs = require('fs')
  let content = fs.readFileSync('bun.lock', 'utf8')
  ${replacements.map(([from, to]) => `
  if (!content.includes(${JSON.stringify(from)})) {
    console.error('rewriteBunLockScript: no match for ' + ${JSON.stringify(from)})
    process.exit(93)
  }
  content = content.split(${JSON.stringify(from)}).join(${JSON.stringify(to)})`).join('\n')}
  fs.writeFileSync('bun.lock', content)
`

// Ambient values (particularly CHECKLY_LOCKFILE_PRUNE) must not leak into
// test outcomes.
const testEnv = (): NodeJS.ProcessEnv => ({ ...process.env, CHECKLY_LOCKFILE_PRUNE: undefined })

// A PackageManager whose lockfile-only install command is replaced, for
// exercising failure paths without a real package manager.
const stubPackageManager = (runnable: Runnable | undefined): PackageManager => {
  return Object.assign(Object.create(new PNpmDetector()), {
    lockfileOnlyInstallCommand: () => runnable,
  })
}

describe('lockfile-pruner', () => {
  const tempDirs: string[] = []

  afterAll(async () => {
    await Promise.all(tempDirs.map(dir => fs.rm(dir, { recursive: true, force: true, maxRetries: 3 })))
  })

  const makeTempDir = async (): Promise<string> => {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'lockfile-pruner-spec-')))
    tempDirs.push(dir)
    return dir
  }

  // Builds the workspace + bundle file map for a fixture, simulating a
  // bundle where the `used` member is imported (real manifest), the `shimmed`
  // member is declared but unimported (faux manifest), and the `absent`
  // member is missing entirely.
  const makeScenario = (root: string, lockfileName: string) => {
    const used = new Package({ name: '@fixture/used', path: path.join(root, 'packages/used'), version: '1.0.0' })
    const shimmed = new Package({ name: '@fixture/shimmed', path: path.join(root, 'packages/shimmed'), version: '1.0.0' })
    const absent = new Package({ name: '@fixture/absent', path: path.join(root, 'packages/absent'), version: '1.0.0' })

    const configFile = lockfileName === 'pnpm-lock.yaml'
      ? Ok(path.join(root, 'pnpm-workspace.yaml'))
      : Err(new Error('no config file'))

    const workspace = new Workspace({
      root: new Package({ name: 'lockfile-pruner-fixture', path: root }),
      packages: [used, shimmed, absent],
      lockfile: Ok(path.join(root, lockfileName)),
      configFile,
    })

    const physical = (archivePath: string): [string, File] => [
      archivePath,
      { filePath: path.join(root, ...archivePath.split('/')), physical: true },
    ]

    const files = new Map<string, File>([
      physical('package.json'),
      physical(lockfileName),
      physical('packages/used/package.json'),
      ['packages/shimmed/package.json', createFauxPackageFiles(shimmed)[0]],
    ])
    if (lockfileName === 'pnpm-lock.yaml') {
      files.set(...physical('pnpm-workspace.yaml'))
    }

    return { workspace, files, used, shimmed, absent }
  }

  const makePnpmScenario = (root: string = PNPM_FIXTURE_ROOT) => makeScenario(root, 'pnpm-lock.yaml')
  const makeNpmScenario = (root: string = NPM_FIXTURE_ROOT) => makeScenario(root, 'package-lock.json')
  const makeBunScenario = (root: string = BUN_FIXTURE_ROOT) => makeScenario(root, 'bun.lock')

  describe('shouldPruneLockfile()', () => {
    it('skips when disabled via CHECKLY_LOCKFILE_PRUNE=0', () => {
      const { workspace, files } = makePnpmScenario()
      const decision = shouldPruneLockfile(workspace, files, { CHECKLY_LOCKFILE_PRUNE: '0' })
      expect(decision).toMatchObject({ prune: false, reason: expect.stringContaining('CHECKLY_LOCKFILE_PRUNE') })
    })

    it('skips when the workspace has no lockfile', () => {
      const { workspace, files } = makePnpmScenario()
      const noLockfile = new Workspace({
        root: workspace.root,
        packages: workspace.packages,
        lockfile: Err(new Error('no lockfile')),
        configFile: workspace.configFile,
      })
      expect(shouldPruneLockfile(noLockfile, files, {})).toMatchObject({ prune: false })
    })

    it('skips when the bundle does not contain the lockfile', () => {
      const { workspace, files } = makePnpmScenario()
      files.delete('pnpm-lock.yaml')
      expect(shouldPruneLockfile(workspace, files, {})).toMatchObject({
        prune: false,
        reason: expect.stringContaining('does not contain the lockfile'),
      })
    })

    it('skips when the bundle contains the full workspace', () => {
      const { workspace, files } = makePnpmScenario()
      files.set('packages/shimmed/package.json', {
        filePath: path.join(PNPM_FIXTURE_ROOT, 'packages/shimmed/package.json'),
        physical: true,
      })
      files.set('packages/absent/package.json', {
        filePath: path.join(PNPM_FIXTURE_ROOT, 'packages/absent/package.json'),
        physical: true,
      })
      expect(shouldPruneLockfile(workspace, files, {})).toMatchObject({
        prune: false,
        reason: expect.stringContaining('full workspace'),
      })
    })

    it('skips when a faux member version is unknown', () => {
      const { workspace, files, shimmed } = makePnpmScenario()
      shimmed.version = undefined
      expect(shouldPruneLockfile(workspace, files, {})).toMatchObject({
        prune: false,
        reason: expect.stringContaining('@fixture/shimmed'),
      })
    })

    it('prunes when the bundle differs from the workspace', () => {
      const { workspace, files } = makePnpmScenario()
      expect(shouldPruneLockfile(workspace, files, {})).toEqual({
        prune: true,
        lockfileArchivePath: 'pnpm-lock.yaml',
      })
    })
  })

  describe('selectMaterializationEntries()', () => {
    it('selects manifests, package manager config, patches and the lockfile', () => {
      const files = new Map<string, File>([
        ['package.json', { filePath: '/ws/package.json', physical: true }],
        ['pnpm-lock.yaml', { filePath: '/ws/pnpm-lock.yaml', physical: true }],
        ['pnpm-workspace.yaml', { filePath: '/ws/pnpm-workspace.yaml', physical: true }],
        ['.npmrc', { filePath: '/ws/.npmrc', physical: true }],
        ['.pnpmfile.cjs', { filePath: '/ws/.pnpmfile.cjs', physical: true }],
        ['patches/left-pad.patch', { filePath: '/ws/patches/left-pad.patch', physical: true }],
        ['packages/a/package.json', { filePath: '/ws/packages/a/package.json', physical: false, content: '{}' }],
        ['tests/foo.spec.ts', { filePath: '/ws/tests/foo.spec.ts', physical: true }],
        ['node_modules/dep/package.json', { filePath: '/ws/node_modules/dep/package.json', physical: true }],
        ['.checkly/embedded-packages/a.tgz', { filePath: '/ws/.checkly/embedded-packages/a.tgz', physical: true }],
        ['../outside/package.json', { filePath: '/outside/package.json', physical: true }],
        ['packages/link/package.json', {
          filePath: '/ws/packages/link/package.json',
          physical: true,
          symlinkTarget: '../real',
        }],
      ])

      const selected = selectMaterializationEntries(files, 'pnpm-lock.yaml').map(([archivePath]) => archivePath)
      expect(selected.sort()).toEqual([
        '.npmrc',
        '.pnpmfile.cjs',
        'package.json',
        'packages/a/package.json',
        'patches/left-pad.patch',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
      ])
    })

    it('always selects the lockfile, even as a symlink entry', () => {
      const files = new Map<string, File>([
        ['pnpm-lock.yaml', {
          filePath: '/ws/pnpm-lock.yaml',
          physical: true,
          symlinkTarget: 'config/pnpm-lock.yaml',
        }],
      ])
      const selected = selectMaterializationEntries(files, 'pnpm-lock.yaml').map(([archivePath]) => archivePath)
      expect(selected).toEqual(['pnpm-lock.yaml'])
    })
  })

  describe('pruneBundledLockfile()', () => {
    it('skips notably for an unsupported package manager even when the lockfile is unreadable', async () => {
      // Pins the ordering invariant in pruneBundledLockfile: the capability
      // check runs before the lockfile read, so an unsupported package
      // manager never surfaces a read error as a 'failed' warning that
      // implies pruning was attempted.
      const { workspace: base, files } = makePnpmScenario()
      const missingLockfile = path.join(PNPM_FIXTURE_ROOT, 'missing-pnpm-lock.yaml')
      const workspace = new Workspace({
        root: base.root,
        packages: base.packages,
        lockfile: Ok(missingLockfile),
        configFile: Ok(path.join(PNPM_FIXTURE_ROOT, 'pnpm-workspace.yaml')),
      })
      files.delete('pnpm-lock.yaml')
      files.set('missing-pnpm-lock.yaml', { filePath: missingLockfile, physical: true })
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(undefined),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('lockfile-only'),
        notable: true,
      })
    })

    it('skips notably when the executable does not exist', async () => {
      // A lockfile can be committed without its package manager being
      // installed where the CLI runs (e.g. a bun.lock deployed from a
      // node-only CI image). That is a skip with an accurate reason, not a
      // failure implying the lockfile itself is broken.
      const { workspace, files } = makePnpmScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('checkly-no-such-executable-xyz', [])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('checkly-no-such-executable-xyz is not installed'),
        notable: true,
      })
    })

    it('fails when the command times out', async () => {
      const { workspace, files } = makePnpmScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', 'setInterval(() => {}, 1000)'])),
        files,
        timeoutMs: 500,
        env: testEnv(),
      })
      expect(result).toMatchObject({ status: 'failed', reason: expect.stringContaining('timed out') })
    }, 30_000)

    it('skips when the regenerated lockfile is identical and nothing was backfilled', async () => {
      const { workspace, files } = makePnpmScenario()
      // With the absent member's real manifest in the bundle there is
      // nothing to backfill, so an unchanged lockfile means nothing to do.
      files.set('packages/absent/package.json', {
        filePath: path.join(PNPM_FIXTURE_ROOT, 'packages/absent/package.json'),
        physical: true,
      })
      const result = await pruneBundledLockfile({
        workspace,
        // A command that does nothing leaves the materialized lockfile as-is.
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({ status: 'skipped', reason: expect.stringContaining('identical') })
    })

    it('reports a prune with the original content when only backfill is needed', async () => {
      const { workspace, files } = makePnpmScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      // The absent member must be backfilled even though the lockfile itself
      // did not change — a lockfile importer without a bundled manifest
      // breaks the remote install.
      expect(result).toMatchObject({ status: 'pruned' })
      if (result.status !== 'pruned') {
        return
      }
      expect(result.backfilledManifests).toHaveLength(1)
      expect(JSON.parse(result.backfilledManifests[0].content).name).toEqual('@fixture/absent')
    })

    it('strips behavior-altering npm_config env vars but keeps everything else', async () => {
      const { workspace, files } = makePnpmScenario()
      const outFile = path.join(await makeTempDir(), 'env.json')
      const script = `require('fs').writeFileSync(${JSON.stringify(outFile)}, JSON.stringify(process.env))`
      await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: {
          ...testEnv(),
          npm_config_frozen_lockfile: 'true',
          npm_config_dry_run: 'true',
          NPM_CONFIG_LOCKFILE: 'false',
          npm_config_package_lock: 'false',
          npm_config_ignore_workspace: 'true',
          npm_config_lockfile_dir: '/tmp/decoy',
          npm_config_registry: 'https://registry.example.com/',
        },
      })
      const childEnv = JSON.parse(await fs.readFile(outFile, 'utf8'))
      expect(childEnv.npm_config_frozen_lockfile).toBeUndefined()
      expect(childEnv.npm_config_dry_run).toBeUndefined()
      expect(childEnv.NPM_CONFIG_LOCKFILE).toBeUndefined()
      expect(childEnv.npm_config_package_lock).toBeUndefined()
      expect(childEnv.npm_config_ignore_workspace).toBeUndefined()
      expect(childEnv.npm_config_lockfile_dir).toBeUndefined()
      expect(childEnv.npm_config_registry).toEqual('https://registry.example.com/')
      expect(childEnv.COREPACK_ENABLE_STRICT).toEqual('0')
    })

    it('fails when a workspace link is no longer a link after regeneration', async () => {
      const { workspace, files } = makePnpmScenario()
      const script = `
        const fs = require('fs')
        const content = fs.readFileSync('pnpm-lock.yaml', 'utf8')
        fs.writeFileSync('pnpm-lock.yaml', content.split('link:packages/used').join('9.9.9'))
      `
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('no longer a workspace link'),
      })
    })

    it('fails when the regenerated lockfile resolves new entries', async () => {
      const { workspace, files } = makePnpmScenario()
      const script = `
        const fs = require('fs')
        const content = fs.readFileSync('pnpm-lock.yaml', 'utf8')
        fs.writeFileSync('pnpm-lock.yaml', content + '\\n  safe-buffer@5.2.1:\\n    resolution: {integrity: sha512-x}\\n')
      `
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('not present in the original'),
      })
    })

    it('fails when the lockfile format version changes', async () => {
      const { workspace, files } = makePnpmScenario()
      const script = `
        const fs = require('fs')
        const content = fs.readFileSync('pnpm-lock.yaml', 'utf8')
        fs.writeFileSync('pnpm-lock.yaml', content.replace("lockfileVersion: '9.0'", "lockfileVersion: '6.0'"))
      `
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('lockfile version changed'),
      })
    })

    it('fails when a bundled importer disappears from the lockfile', async () => {
      const { workspace, files } = makePnpmScenario()
      const script = `
        const fs = require('fs')
        const content = fs.readFileSync('pnpm-lock.yaml', 'utf8')
        // Rename the used member's importer so it effectively disappears.
        fs.writeFileSync('pnpm-lock.yaml', content.replace('  packages/used:', '  packages/renamed:'))
      `
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining(`lost the importer 'packages/used'`),
      })
    })

    it('skips when the lockfile records a pnpmfile checksum but no pnpmfile is bundled', async () => {
      const root = await makeTempDir()
      await fs.cp(PNPM_FIXTURE_ROOT, root, { recursive: true })
      const lockfilePath = path.join(root, 'pnpm-lock.yaml')
      await fs.appendFile(lockfilePath, '\npnpmfileChecksum: sha256-abcdef\n')

      const { workspace, files } = makePnpmScenario(root)
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('pnpmfile checksum'),
      })
    })

    it('skips when the lockfile is written with excludeLinksFromLockfile', async () => {
      const root = await makeTempDir()
      await fs.cp(PNPM_FIXTURE_ROOT, root, { recursive: true })
      const lockfilePath = path.join(root, 'pnpm-lock.yaml')
      const content = await fs.readFile(lockfilePath, 'utf8')
      await fs.writeFile(lockfilePath, content.replace(
        'excludeLinksFromLockfile: false',
        'excludeLinksFromLockfile: true',
      ))

      const { workspace, files } = makePnpmScenario(root)
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('excludeLinksFromLockfile'),
      })
    })

    it('fails when the regenerated lockfile drops the pnpmfile checksum', async () => {
      const root = await makeTempDir()
      await fs.cp(PNPM_FIXTURE_ROOT, root, { recursive: true })
      const lockfilePath = path.join(root, 'pnpm-lock.yaml')
      await fs.appendFile(lockfilePath, '\npnpmfileChecksum: sha256-abcdef\n')
      await fs.writeFile(path.join(root, '.pnpmfile.cjs'), 'module.exports = {}\n')

      const { workspace, files } = makePnpmScenario(root)
      files.set('.pnpmfile.cjs', { filePath: path.join(root, '.pnpmfile.cjs'), physical: true })

      const script = `
        const fs = require('fs')
        const content = fs.readFileSync('pnpm-lock.yaml', 'utf8')
        fs.writeFileSync('pnpm-lock.yaml', content.split('\\n').filter(l => !l.startsWith('pnpmfileChecksum')).join('\\n'))
      `
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('pnpmfile checksum'),
      })
    })

    it('skips when a backfilled member version is unknown', async () => {
      const { workspace, files, absent } = makePnpmScenario()
      absent.version = undefined
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('@fixture/absent'),
      })
    })

    it('redacts credentials and truncates long output in failure reasons', async () => {
      const { workspace, files } = makePnpmScenario()
      // The script goes through a file so the credential appears only in the
      // child's output, not in the displayed command line.
      const scriptPath = path.join(await makeTempDir(), 'fail.cjs')
      await fs.writeFile(scriptPath, `
        process.stdout.write('GET https://alice:sup3rsecret@registry.example.com/pkg failed ' + 'x'.repeat(600))
        process.exit(1)
      `)
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', [scriptPath])),
        files,
        env: testEnv(),
      })
      expect(result.status).toEqual('failed')
      if (result.status !== 'failed') {
        return
      }
      expect(result.reason).not.toContain('sup3rsecret')
      expect(result.reason).toContain('registry.example.com')
      expect(result.reason).toContain('…')
    })

    it('drops the importer of a member no bundled manifest references', async () => {
      // The pruner's primary outcome: a workspace member that nothing in the
      // bundle depends on loses its importer (and its dependencies) without
      // failing the prune.
      const root = await makeTempDir()
      await fs.cp(PNPM_FIXTURE_ROOT, root, { recursive: true })
      const rootManifestPath = path.join(root, 'package.json')
      const rootManifest = JSON.parse(await fs.readFile(rootManifestPath, 'utf8'))
      delete rootManifest.dependencies['@fixture/absent']
      await fs.writeFile(rootManifestPath, JSON.stringify(rootManifest, undefined, 2))

      const { workspace, files } = makePnpmScenario(root)
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new PNpmDetector(),
        files,
        env: testEnv(),
      })

      expect(result.status).toEqual('pruned')
      if (result.status !== 'pruned') {
        return
      }
      expect(result.backfilledManifests).toHaveLength(0)
      expect(result.content).not.toContain('packages/absent')
      expect(result.content).not.toContain('ee-first')
      expect(result.content).toContain('link:packages/used')
      expect(result.content).toContain('link:packages/shimmed')
    }, 60_000)

    // Plants a lockfile-dir setting pointing at decoyDir in both config
    // channels: pnpm <= 10 reads the setting from .npmrc while pnpm 11 only
    // honors lockfileDir in pnpm-workspace.yaml.
    const plantLockfileDirDecoys = async (files: Map<string, File>, decoyDir: string) => {
      files.set('.npmrc', {
        filePath: path.join(PNPM_FIXTURE_ROOT, '.npmrc'),
        physical: false,
        content: `lockfile-dir=${decoyDir}\n`,
      })
      const workspaceYaml = await fs.readFile(path.join(PNPM_FIXTURE_ROOT, 'pnpm-workspace.yaml'), 'utf8')
      files.set('pnpm-workspace.yaml', {
        filePath: path.join(PNPM_FIXTURE_ROOT, 'pnpm-workspace.yaml'),
        physical: false,
        content: `${workspaceYaml}lockfileDir: ${decoyDir}\n`,
      })
    }

    it('pins the lockfile write to the temp dir despite a config lockfile-dir, with real pnpm', async () => {
      const { workspace, files } = makePnpmScenario()
      // The explicit --lockfile-dir flag on the prune command must outrank
      // a lockfile-dir setting from a materialized config file — otherwise
      // the subprocess could write over a lockfile outside the temp dir.
      const decoyDir = await makeTempDir()
      await plantLockfileDirDecoys(files, decoyDir)
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new PNpmDetector(),
        files,
        env: testEnv(),
      })
      expect(result.status).toEqual('pruned')
      await expect(fs.access(path.join(decoyDir, 'pnpm-lock.yaml'))).rejects.toThrow()
    }, 60_000)

    it('decoy control: pnpm honors a config lockfile-dir when the flag is absent', async () => {
      // Positive control for the test above: proves the planted channels
      // actually reach the pnpm on PATH. If a future pnpm major stops
      // reading both channels, this fails and the decoys need updating —
      // without it, the pinning test could pass vacuously.
      const { workspace, files } = makePnpmScenario()
      const decoyDir = await makeTempDir()
      await plantLockfileDirDecoys(files, decoyDir)
      // Seed the decoy with the original lockfile so the redirected run can
      // reuse its resolutions instead of needing registry access, and so
      // the assertion below can detect that pnpm rewrote it.
      const seedContent = await fs.readFile(path.join(PNPM_FIXTURE_ROOT, 'pnpm-lock.yaml'), 'utf8')
      await fs.writeFile(path.join(decoyDir, 'pnpm-lock.yaml'), seedContent)
      // Derive the unpinned command from the production one so a future
      // change to the real argument list flows into this control instead of
      // silently diverging from it.
      const pinned = new PNpmDetector().lockfileOnlyInstallCommand()
      const unpinned = new Runnable(pinned.executable, pinned.args.filter((arg, i, args) => {
        return arg !== '--lockfile-dir' && args[i - 1] !== '--lockfile-dir'
      }))
      await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(unpinned),
        files,
        env: testEnv(),
      })
      const decoyContent = await fs.readFile(path.join(decoyDir, 'pnpm-lock.yaml'), 'utf8')
      expect(decoyContent).not.toEqual(seedContent)
    }, 60_000)

    it('prunes the lockfile with real pnpm, backfilling link-referenced members', async () => {
      const { workspace, files } = makePnpmScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new PNpmDetector(),
        files,
        env: testEnv(),
      })

      expect(result.status).toEqual('pruned')
      if (result.status !== 'pruned') {
        return
      }

      expect(result.archivePath).toEqual('pnpm-lock.yaml')

      // The root manifest declares @fixture/absent as workspace:*, so a faux
      // manifest must have been backfilled for it.
      expect(result.backfilledManifests).toHaveLength(1)
      expect(result.backfilledManifests[0].filePath)
        .toEqual(path.join(PNPM_FIXTURE_ROOT, 'packages/absent/package.json'))
      expect(JSON.parse(result.backfilledManifests[0].content)).toMatchObject({
        name: '@fixture/absent',
        version: '1.0.0',
      })

      // Kept: the imported member and its dependency, and every workspace link.
      expect(result.content).toContain('link:packages/used')
      expect(result.content).toContain('link:packages/shimmed')
      expect(result.content).toContain('link:packages/absent')
      expect(result.content).toContain('ms@2.1.3')

      // Dropped: dependencies of the shimmed and absent members.
      expect(result.content).not.toContain('isarray')
      expect(result.content).not.toContain('ee-first')
    }, 60_000)

    it('fails when npm silently replaces a workspace link with a registry package', async () => {
      const { workspace, files } = makeNpmScenario()
      // Simulate npm's registry substitution: the link entry for the used
      // member becomes a plain registry resolution that exists nowhere in
      // the original lockfile.
      const script = `
        const fs = require('fs')
        const doc = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
        doc.packages['node_modules/@fixture/used'] = {
          version: '1.0.1',
          resolved: 'https://registry.npmjs.org/@fixture/used/-/used-1.0.1.tgz',
          integrity: 'sha512-x',
        }
        fs.writeFileSync('package-lock.json', JSON.stringify(doc, null, 2))
      `
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('not present in the original'),
      })
    })

    it('fails when an npm dependency is re-resolved to a different version', async () => {
      const { workspace, files } = makeNpmScenario()
      const script = `
        const fs = require('fs')
        const doc = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
        doc.packages['node_modules/ms'].version = '2.0.0'
        fs.writeFileSync('package-lock.json', JSON.stringify(doc, null, 2))
      `
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('not present in the original'),
      })
    })

    it('skips unsupported lockfile formats', async () => {
      const npmV1Root = await makeTempDir()
      await fs.cp(NPM_FIXTURE_ROOT, npmV1Root, { recursive: true })
      await fs.writeFile(
        path.join(npmV1Root, 'package-lock.json'),
        JSON.stringify({ name: 'x', lockfileVersion: 1, dependencies: {} }),
      )
      const npmScenario = makeNpmScenario(npmV1Root)
      expect(await pruneBundledLockfile({
        workspace: npmScenario.workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files: npmScenario.files,
        env: testEnv(),
      })).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('unsupported'),
        notable: true,
      })

      // A structurally valid pnpm lockfile at an out-of-range version must
      // fail closed rather than passing the verification vacuously.
      const pnpmV5Root = await makeTempDir()
      await fs.cp(PNPM_FIXTURE_ROOT, pnpmV5Root, { recursive: true })
      const v5LockfilePath = path.join(pnpmV5Root, 'pnpm-lock.yaml')
      const v5Content = await fs.readFile(v5LockfilePath, 'utf8')
      await fs.writeFile(v5LockfilePath, v5Content.replace('lockfileVersion: \'9.0\'', 'lockfileVersion: \'5.4\''))
      const pnpmV5Scenario = makePnpmScenario(pnpmV5Root)
      expect(await pruneBundledLockfile({
        workspace: pnpmV5Scenario.workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files: pnpmV5Scenario.files,
        env: testEnv(),
      })).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('unsupported'),
        notable: true,
      })

      const pnpmRoot = await makeTempDir()
      await fs.cp(PNPM_FIXTURE_ROOT, pnpmRoot, { recursive: true })
      await fs.writeFile(path.join(pnpmRoot, 'pnpm-lock.yaml'), 'just a string')
      const pnpmScenario = makePnpmScenario(pnpmRoot)
      expect(await pruneBundledLockfile({
        workspace: pnpmScenario.workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files: pnpmScenario.files,
        env: testEnv(),
      })).toMatchObject({ status: 'skipped', reason: expect.stringContaining('could not parse') })
    })

    it('does not mark explicitly disabled skips as notable', async () => {
      const { workspace, files } = makePnpmScenario()
      const disabled = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: { ...testEnv(), CHECKLY_LOCKFILE_PRUNE: '0' },
      })
      expect(disabled.status).toEqual('skipped')
      expect(disabled.status === 'skipped' && disabled.notable).toBeFalsy()
    })

    // Replaces the root manifest with a virtual one that references the
    // absent member through peerDependencies only. Shared between the peer
    // backfill tests so they stay a controlled comparison.
    const setRootManifestWithAbsentPeer = (files: Map<string, File>, peerDependenciesMeta?: object) => {
      files.set('package.json', {
        filePath: path.join(PNPM_FIXTURE_ROOT, 'package.json'),
        physical: false,
        content: JSON.stringify({
          name: 'lockfile-pruner-fixture',
          private: true,
          dependencies: {
            '@fixture/used': 'workspace:*',
            '@fixture/shimmed': 'workspace:*',
          },
          peerDependencies: {
            '@fixture/absent': 'workspace:*',
          },
          // JSON.stringify omits undefined-valued properties, so a call
          // without meta produces a manifest without the key.
          peerDependenciesMeta,
        }),
      })
    }

    it('backfills members referenced only through peerDependencies', async () => {
      const { workspace, files } = makePnpmScenario()
      // The root manifest becomes virtual, so the root package needs a
      // known version to pass the unknown-version guard.
      workspace.root.version = '1.0.0'
      setRootManifestWithAbsentPeer(files)
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result.status).toEqual('pruned')
      if (result.status !== 'pruned') {
        return
      }
      expect(result.backfilledManifests).toHaveLength(1)
      expect(JSON.parse(result.backfilledManifests[0].content).name).toEqual('@fixture/absent')
    })

    it('backfills workspace peers even when marked optional, with real pnpm', async () => {
      const { workspace, files } = makePnpmScenario()
      workspace.root.version = '1.0.0'
      // pnpm resolves a workspace: peer spec regardless of
      // peerDependenciesMeta.optional when auto-install-peers is on (the
      // default), so without the backfill the install fails with
      // ERR_PNPM_WORKSPACE_PKG_NOT_FOUND.
      setRootManifestWithAbsentPeer(files, { '@fixture/absent': { optional: true } })
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new PNpmDetector(),
        files,
        env: testEnv(),
      })
      expect(result.status).toEqual('pruned')
      if (result.status !== 'pruned') {
        return
      }
      expect(result.backfilledManifests).toHaveLength(1)
      expect(JSON.parse(result.backfilledManifests[0].content).name).toEqual('@fixture/absent')
    }, 60_000)

    it('prunes the lockfile with real npm, backfilling link-referenced members', async () => {
      const { workspace, files } = makeNpmScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new NpmDetector(),
        files,
        env: testEnv(),
      })

      expect(result.status).toEqual('pruned')
      if (result.status !== 'pruned') {
        return
      }

      expect(result.archivePath).toEqual('package-lock.json')

      // The root manifest declares @fixture/absent with a semver range and
      // the original lockfile resolves it as a link, so a faux manifest must
      // have been backfilled for it.
      expect(result.backfilledManifests).toHaveLength(1)
      expect(JSON.parse(result.backfilledManifests[0].content)).toMatchObject({
        name: '@fixture/absent',
        version: '1.0.0',
      })

      const doc = JSON.parse(result.content)
      // Kept: every workspace link and the imported member's dependency.
      for (const name of ['@fixture/used', '@fixture/shimmed', '@fixture/absent']) {
        expect(doc.packages[`node_modules/${name}`]).toMatchObject({ link: true })
      }
      expect(doc.packages['node_modules/ms']).toBeDefined()

      // Dropped: dependencies of the shimmed and absent members.
      expect(doc.packages['node_modules/isarray']).toBeUndefined()
      expect(doc.packages['node_modules/ee-first']).toBeUndefined()
    }, 60_000)

    // The bun stub scripts below mutate the materialized bun.lock via string
    // replacement rather than parse-and-rewrite: bun.lock is JSONC with
    // trailing commas, which node's JSON.parse rejects, and the prune temp
    // dir has no node_modules to load a JSON5 parser from.

    it('reports a bun prune with the original content when only backfill is needed', async () => {
      const { workspace, files } = makeBunScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({ status: 'pruned', archivePath: 'bun.lock' })
      if (result.status !== 'pruned') {
        return
      }
      expect(result.backfilledManifests).toHaveLength(1)
      expect(JSON.parse(result.backfilledManifests[0].content).name).toEqual('@fixture/absent')
    })

    it('fails when a kept bun package entry is rewritten to a different registry URL', async () => {
      // Registry config in the environment makes bun rewrite tarball URLs
      // inside otherwise-unchanged tuples, offline and with exit 0. The
      // rewritten tuple exists nowhere in the original, so the subset check
      // must reject it.
      const { workspace, files } = makeBunScenario()
      const script = rewriteBunLockScript(
        ['["ms@2.1.3", "",', '["ms@2.1.3", "https://mirror.example.com/ms/-/ms-2.1.3.tgz",'],
      )
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('not present in the original'),
      })
    })

    it('accepts a bun package entry re-keyed under a different hoist key', async () => {
      // Pruning the member that owns a hoisted key makes bun re-key the
      // surviving member-scoped entry with an unchanged tuple. The subset
      // check is keyed by tuple content, so the rename alone must not fail
      // the verification.
      const { workspace, files } = makeBunScenario()
      const script = rewriteBunLockScript(
        ['"ms": ["ms@2.1.3"', '"@fixture/used/ms": ["ms@2.1.3"'],
      )
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({ status: 'pruned' })
    })

    it('treats an absent bun configVersion as 0', async () => {
      // bun writes an explicit `configVersion: 0` when regenerating a
      // lockfile that lacks the field, so absent-vs-0 must not be reported
      // as a version change.
      const root = await makeTempDir()
      await fs.cp(BUN_FIXTURE_ROOT, root, { recursive: true })
      const lockfilePath = path.join(root, 'bun.lock')
      const content = await fs.readFile(lockfilePath, 'utf8')
      // No newline in the search string: a Windows checkout may carry CRLF.
      await fs.writeFile(lockfilePath, content.replace('"configVersion": 1,', ''))

      const { workspace, files } = makeBunScenario(root)
      const script = rewriteBunLockScript(
        ['"lockfileVersion": 1,', '"lockfileVersion": 1,\n  "configVersion": 0,'],
      )
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({ status: 'pruned' })
    })

    it('fails when the bun configVersion changes', async () => {
      const { workspace, files } = makeBunScenario()
      const script = rewriteBunLockScript(
        ['"configVersion": 1,', '"configVersion": 2,'],
      )
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('lockfile version changed'),
      })
      if (result.status !== 'failed') {
        return
      }
      expect(result.reason).toContain('configVersion')
    })

    it('skips unsupported bun lockfiles notably', async () => {
      // An unknown lockfileVersion fails closed before any command runs.
      const versionRoot = await makeTempDir()
      await fs.cp(BUN_FIXTURE_ROOT, versionRoot, { recursive: true })
      const versionLockfilePath = path.join(versionRoot, 'bun.lock')
      const versionContent = await fs.readFile(versionLockfilePath, 'utf8')
      await fs.writeFile(versionLockfilePath, versionContent.replace('"lockfileVersion": 1,', '"lockfileVersion": 2,'))
      const versionScenario = makeBunScenario(versionRoot)
      expect(await pruneBundledLockfile({
        workspace: versionScenario.workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files: versionScenario.files,
        env: testEnv(),
      })).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('unsupported'),
        notable: true,
      })

      // The binary lockfile format is rejected by basename, with a remedy.
      const binaryRoot = await makeTempDir()
      await fs.cp(BUN_FIXTURE_ROOT, binaryRoot, { recursive: true })
      await fs.writeFile(path.join(binaryRoot, 'bun.lockb'), Buffer.from([0x62, 0x75, 0x6e, 0x00, 0x01, 0x02]))
      const binaryScenario = makeScenario(binaryRoot, 'bun.lockb')
      expect(await pruneBundledLockfile({
        workspace: binaryScenario.workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files: binaryScenario.files,
        env: testEnv(),
      })).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('bun install --save-text-lockfile'),
        notable: true,
      })
    })

    // Builds a workspace where the `ms` member is consumed through a bare
    // semver range — which bun records verbatim in the importer while
    // resolving it to a member-scoped workspace tuple — AND a same-named
    // registry package is consumed by the root. Link classification for
    // these edges depends entirely on the per-edge member-scoped-then-
    // hoisted packages-key probe: a name-global answer would misclassify
    // one of the two edges. The lockfile is hand-built (plain JSON is valid
    // JSONC) mirroring bun 1.3.11's real layout for this shape, with
    // single-line entries so stub scripts can rewrite it via string
    // replacement.
    const makeMixedBunScenario = async () => {
      const root = await makeTempDir()
      await fs.mkdir(path.join(root, 'packages/a'), { recursive: true })
      await fs.mkdir(path.join(root, 'packages/ms'), { recursive: true })
      await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
        name: 'mixed-bun-fixture',
        private: true,
        workspaces: ['packages/*'],
        dependencies: { ms: '2.1.3' },
      }))
      await fs.writeFile(path.join(root, 'packages/a/package.json'), JSON.stringify({
        name: 'a',
        version: '1.0.0',
        dependencies: { ms: '^1.0.0' },
      }))
      await fs.writeFile(path.join(root, 'packages/ms/package.json'), JSON.stringify({
        name: 'ms',
        version: '1.0.0',
      }))
      await fs.writeFile(path.join(root, 'bun.lock'), `{
  "lockfileVersion": 1,
  "workspaces": {
    "": { "name": "mixed-bun-fixture", "dependencies": { "ms": "2.1.3" } },
    "packages/a": { "name": "a", "version": "1.0.0", "dependencies": { "ms": "^1.0.0" } },
    "packages/ms": { "name": "ms", "version": "1.0.0" }
  },
  "packages": {
    "a": ["a@workspace:packages/a"],
    "a/ms": ["ms@workspace:packages/ms"],
    "ms": ["ms@2.1.3", "", {}, "sha512-mmm"]
  }
}`)

      const a = new Package({ name: 'a', path: path.join(root, 'packages/a'), version: '1.0.0' })
      const msMember = new Package({ name: 'ms', path: path.join(root, 'packages/ms'), version: '1.0.0' })
      const workspace = new Workspace({
        root: new Package({ name: 'mixed-bun-fixture', path: root }),
        packages: [a, msMember],
        lockfile: Ok(path.join(root, 'bun.lock')),
        configFile: Err(new Error('no config file')),
      })
      const files = new Map<string, File>([
        ['package.json', { filePath: path.join(root, 'package.json'), physical: true }],
        ['bun.lock', { filePath: path.join(root, 'bun.lock'), physical: true }],
        ['packages/a/package.json', { filePath: path.join(root, 'packages/a/package.json'), physical: true }],
        // The ms member's manifest is deliberately not in the bundle.
      ])
      return { workspace, files, a }
    }

    it('backfills a bun member consumed through a bare semver range', async () => {
      const { workspace, files } = await makeMixedBunScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      // The manifest spec is '^1.0.0', not 'workspace:*', so the backfill
      // can only trigger through the lockfile's per-edge link resolution
      // (the member-scoped 'a/ms' workspace tuple), never through the spec
      // prefix.
      expect(result).toMatchObject({ status: 'pruned' })
      if (result.status !== 'pruned') {
        return
      }
      expect(result.backfilledManifests).toHaveLength(1)
      expect(JSON.parse(result.backfilledManifests[0].content).name).toEqual('ms')
    })

    it('backfills a bun member consumed through a bare-semver peer dependency', async () => {
      // Unlike pnpm importers, bun workspace entries record peerDependencies
      // as their own group, and the snapshot parser must walk it: a peer
      // edge resolved to a workspace tuple triggers backfill exactly like a
      // regular dependency edge. The hand-built lockfile mirrors what bun
      // 1.3.11 emits for this shape: the peer-consumed member holds the
      // hoisted packages key as a workspace tuple.
      const root = await makeTempDir()
      await fs.mkdir(path.join(root, 'packages/a'), { recursive: true })
      await fs.mkdir(path.join(root, 'packages/core'), { recursive: true })
      await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
        name: 'peer-bun-fixture',
        private: true,
        workspaces: ['packages/*'],
      }))
      await fs.writeFile(path.join(root, 'packages/a/package.json'), JSON.stringify({
        name: 'a',
        version: '1.0.0',
        peerDependencies: { core: '^1.0.0' },
      }))
      await fs.writeFile(path.join(root, 'packages/core/package.json'), JSON.stringify({
        name: 'core',
        version: '1.0.0',
      }))
      await fs.writeFile(path.join(root, 'bun.lock'), `{
  "lockfileVersion": 1,
  "workspaces": {
    "": { "name": "peer-bun-fixture" },
    "packages/a": { "name": "a", "version": "1.0.0", "peerDependencies": { "core": "^1.0.0" } },
    "packages/core": { "name": "core", "version": "1.0.0" }
  },
  "packages": {
    "a": ["a@workspace:packages/a"],
    "core": ["core@workspace:packages/core"]
  }
}`)
      const a = new Package({ name: 'a', path: path.join(root, 'packages/a'), version: '1.0.0' })
      const core = new Package({ name: 'core', path: path.join(root, 'packages/core'), version: '1.0.0' })
      const workspace = new Workspace({
        root: new Package({ name: 'peer-bun-fixture', path: root }),
        packages: [a, core],
        lockfile: Ok(path.join(root, 'bun.lock')),
        configFile: Err(new Error('no config file')),
      })
      const files = new Map<string, File>([
        ['package.json', { filePath: path.join(root, 'package.json'), physical: true }],
        ['bun.lock', { filePath: path.join(root, 'bun.lock'), physical: true }],
        ['packages/a/package.json', { filePath: path.join(root, 'packages/a/package.json'), physical: true }],
        // The core member's manifest is deliberately not in the bundle: the
        // backfill must trigger through the peer edge's link resolution.
      ])
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({ status: 'pruned' })
      if (result.status !== 'pruned') {
        return
      }
      expect(result.backfilledManifests).toHaveLength(1)
      expect(JSON.parse(result.backfilledManifests[0].content).name).toEqual('core')
    })

    it('skips notably when bun leaves no regenerated lockfile behind', async () => {
      // Bun deletes a lockfile that would describe no packages ("No
      // packages! Deleted empty lockfile"); the pruner must not blame the
      // user's lockfile for that.
      const { workspace, files } = makeBunScenario()
      const script = 'require(\'fs\').unlinkSync(\'bun.lock\')'
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('was not found after the command completed'),
        notable: true,
      })
    })

    it('fails when a bare-semver bun workspace resolution becomes a registry package', async () => {
      // The bun analog of npm's silent registry substitution: the
      // member-scoped workspace tuple disappears, so the edge that used to
      // resolve to the workspace member now resolves to the same-named
      // hoisted registry package.
      const { workspace, files } = await makeMixedBunScenario()
      const script = rewriteBunLockScript(
        ['"a/ms": ["ms@workspace:packages/ms"],', ''],
      )
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining(`'ms' is no longer a workspace link`),
      })
    })

    it('does not mistake a bun registry edge for a link when the same-named member is pruned away', async () => {
      // With member a shimmed to a dependency-free manifest, pruning
      // legitimately drops both a's dependency on the ms member and the
      // member-scoped workspace tuple — while the root keeps its registry
      // ms. A name-global link classification would mark the root's
      // registry edge as a link in the original and fail verification with
      // a spurious "no longer a workspace link"; the per-edge probe must
      // accept this prune.
      const { workspace, files, a } = await makeMixedBunScenario()
      files.set('packages/a/package.json', createFauxPackageFiles(a)[0])
      const script = rewriteBunLockScript(
        ['"a/ms": ["ms@workspace:packages/ms"],', ''],
        [', "dependencies": { "ms": "^1.0.0" }', ''],
      )
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({ status: 'pruned' })
      if (result.status !== 'pruned') {
        return
      }
      expect(result.content).not.toContain('a/ms')
      expect(result.content).toContain('ms@2.1.3')
    })

    it('fails when a bundled bun importer disappears from the lockfile', async () => {
      const { workspace, files } = makeBunScenario()
      const script = rewriteBunLockScript(
        ['"packages/used": {', '"packages/renamed": {'],
      )
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining(`lost the importer 'packages/used'`),
      })
    })

    it('skips notably for bun when the temp dir sits inside a workspace', async () => {
      // A workspace ancestor of the temp dir can capture bun's root
      // resolution — bun walks up and re-roots at a matching workspaces
      // glob, then writes the regenerated lockfile at THAT root, outside
      // the sandbox and over a real file. The pruner must refuse to run
      // there. (The skip fires before any command is spawned, so this test
      // needs no real bun.)
      const outer = await makeTempDir()
      // Deliberately JSONC (comment + trailing comma): bun's own
      // package.json parser accepts this, so the ancestor scan must too —
      // strict JSON.parse would miss the workspace and let bun escape.
      await fs.writeFile(path.join(outer, 'package.json'), `{
  // ancestor workspace
  "name": "ancestor",
  "private": true,
  "workspaces": ["**"],
}`)
      const tmpInside = path.join(outer, 'tmp')
      await fs.mkdir(tmpInside)
      const { workspace, files } = makeBunScenario()
      vi.stubEnv('TMPDIR', tmpInside)
      vi.stubEnv('TEMP', tmpInside)
      vi.stubEnv('TMP', tmpInside)
      try {
        const result = await pruneBundledLockfile({
          workspace,
          packageManager: new BunDetector(),
          files,
          env: testEnv(),
        })
        expect(result).toMatchObject({
          status: 'skipped',
          reason: expect.stringContaining('outside any workspace to enable pruning'),
          notable: true,
        })
      } finally {
        vi.unstubAllEnvs()
      }
    })

    it('skips notably for bun when an unparseable manifest shadows the temp dir', async () => {
      // A package.json that fails even JSONC parsing cannot be ruled out as
      // a workspace root (bun's own parser might still accept it), so the
      // scan fails safe — with a reason that names the real cause instead
      // of asserting a workspace exists.
      const outer = await makeTempDir()
      await fs.writeFile(path.join(outer, 'package.json'), 'not a manifest {{{')
      const tmpInside = path.join(outer, 'tmp')
      await fs.mkdir(tmpInside)
      const { workspace, files } = makeBunScenario()
      vi.stubEnv('TMPDIR', tmpInside)
      vi.stubEnv('TEMP', tmpInside)
      vi.stubEnv('TMP', tmpInside)
      try {
        const result = await pruneBundledLockfile({
          workspace,
          packageManager: new BunDetector(),
          files,
          env: testEnv(),
        })
        expect(result).toMatchObject({
          status: 'skipped',
          reason: expect.stringContaining('could not be ruled out as a workspace root'),
          notable: true,
        })
      } finally {
        vi.unstubAllEnvs()
      }
    })

    it.skipIf(process.env.CHECKLY_EXPECT_BUN === undefined)('bun is provisioned when CHECKLY_EXPECT_BUN is set', () => {
      // The repo's own CI workflow sets CHECKLY_EXPECT_BUN after
      // provisioning bun; keying off that flag (rather than the generic CI
      // variable) keeps this from failing for users who run the suite with
      // CI=true on machines that legitimately lack bun.
      expect(
        bunAvailable,
        'CHECKLY_EXPECT_BUN is set but bun is missing from PATH, so the real-bun pruner tests were'
        + ' skipped. Restore the oven-sh/setup-bun step in .github/workflows/test.yml.',
      ).toBe(true)
    })

    it.skipIf(!bunAvailable)('prunes the lockfile with real bun, backfilling link-referenced members', async () => {
      const { workspace, files } = makeBunScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new BunDetector(),
        files,
        env: testEnv(),
      })

      expect(result.status).toEqual('pruned')
      if (result.status !== 'pruned') {
        return
      }

      expect(result.archivePath).toEqual('bun.lock')

      // The root manifest declares @fixture/absent as workspace:*, so a faux
      // manifest must have been backfilled for it.
      expect(result.backfilledManifests).toHaveLength(1)
      expect(JSON.parse(result.backfilledManifests[0].content)).toMatchObject({
        name: '@fixture/absent',
        version: '1.0.0',
      })

      // Kept: every workspace member entry (the shimmed and backfilled
      // members keep dependency-free importers) and the imported member's
      // dependency.
      expect(result.content).toContain('@fixture/used@workspace:packages/used')
      expect(result.content).toContain('@fixture/shimmed@workspace:packages/shimmed')
      expect(result.content).toContain('@fixture/absent@workspace:packages/absent')
      expect(result.content).toContain('ms@2.1.3')

      // Dropped: dependencies of the shimmed and absent members.
      expect(result.content).not.toContain('isarray')
      expect(result.content).not.toContain('ee-first')
    }, 60_000)
  })
})
