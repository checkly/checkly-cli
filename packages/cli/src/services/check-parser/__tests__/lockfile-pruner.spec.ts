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
import { BunDetector, NpmDetector, PackageManager, PNpmDetector, Runnable, YarnDetector } from '../package-files/package-manager.js'
import { Package, Workspace } from '../package-files/workspace.js'
import { Err, Ok } from '../package-files/result.js'
import { File } from '../parser.js'

const PNPM_FIXTURE_ROOT = path.join(__dirname, 'lockfile-pruner-fixtures', 'pnpm-workspace')
// Same shape as PNPM_FIXTURE_ROOT, plus two patched dependencies: `ms` is
// consumed by the bundled member, `ee-first` only by the member the bundle
// omits. Pruning therefore leaves the `ee-first` patch applying to nothing,
// which pnpm 10+ rejects unless the install tolerates unused patches.
const PNPM_PATCHED_FIXTURE_ROOT = path.join(__dirname, 'lockfile-pruner-fixtures', 'pnpm-patched-workspace')
const NPM_FIXTURE_ROOT = path.join(__dirname, 'lockfile-pruner-fixtures', 'npm-workspace')
const BUN_FIXTURE_ROOT = path.join(__dirname, 'lockfile-pruner-fixtures', 'bun-workspace')
const YARN_FIXTURE_ROOT = path.join(__dirname, 'lockfile-pruner-fixtures', 'yarn-workspace')
const YARN3_FIXTURE_ROOT = path.join(__dirname, 'lockfile-pruner-fixtures', 'yarn3-workspace')

// Unlike pnpm and npm, bun is not part of the repo's own toolchain, so the
// tests that run a real bun install skip themselves when it is not on PATH.
// A dedicated CI-only test asserts that bun IS provisioned there, so losing
// the provisioning step fails the job with a self-describing message
// instead of silently removing the coverage.
const bunAvailable = spawnSync('bun', ['--version']).status === 0

// Same for yarn, which must additionally resolve to the Yarn Berry major the
// fixture pins via its packageManager field (a Corepack-managed yarn does; a
// standalone Yarn Classic prints 1.x and the real-yarn tests skip). The
// probe needs a shell: Corepack's Windows shim is yarn.cmd, which a
// shell-less spawn cannot resolve even though the pruner's own spawn (execa
// via cross-spawn) can.
const probeYarnMajor = (fixtureRoot: string, major: string): boolean => {
  const probe = spawnSync('yarn --version', {
    cwd: fixtureRoot,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    // Bounds the blocking probe during test collection; a timeout counts
    // as unavailable, so the gated tests skip instead of stalling. Kept
    // short deliberately: a cold corepack cache then skips locally rather
    // than downloading toolchains at import time — CI pre-downloads both
    // pinned versions in a dedicated workflow step and asserts coverage
    // via CHECKLY_EXPECT_YARN.
    timeout: 15_000,
  })
  return probe.status === 0 && probe.stdout?.trim().startsWith(`${major}.`) === true
}
const yarnBerryAvailable = probeYarnMajor(YARN_FIXTURE_ROOT, '4')
const yarn3Available = probeYarnMajor(YARN3_FIXTURE_ROOT, '3')

// Generates a stub package-manager script that rewrites the materialized
// lockfile through string replacements — parse-and-rewrite is not an option
// for bun.lock (JSONC with trailing commas, which node's JSON.parse rejects,
// and the prune temp dir has no node_modules to load a JSON5 parser from),
// so every format is rewritten the same way. A search string that no longer
// matches (e.g. after a fixture change) fails the script rather than
// silently leaving the lockfile unmodified, which would let some tests
// pass vacuously.
const rewriteLockfileScript = (lockfileName: string, ...replacements: Array<[string, string]>): string => `
  const fs = require('fs')
  let content = fs.readFileSync(${JSON.stringify(lockfileName)}, 'utf8')
  ${replacements.map(([from, to]) => `
  if (!content.includes(${JSON.stringify(from)})) {
    console.error('rewriteLockfileScript: no match for ' + ${JSON.stringify(from)})
    process.exit(93)
  }
  content = content.split(${JSON.stringify(from)}).join(${JSON.stringify(to)})`).join('\n')}
  fs.writeFileSync(${JSON.stringify(lockfileName)}, content)
`
const rewriteBunLockScript = (...replacements: Array<[string, string]>): string =>
  rewriteLockfileScript('bun.lock', ...replacements)
const rewriteYarnLockScript = (...replacements: Array<[string, string]>): string =>
  rewriteLockfileScript('yarn.lock', ...replacements)

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
  const makeScenario = (root: string, lockfileName: string, extraFiles: string[] = []) => {
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
    for (const extra of extraFiles) {
      files.set(...physical(extra))
    }

    return { workspace, files, used, shimmed, absent }
  }

  const makePnpmScenario = (root: string = PNPM_FIXTURE_ROOT) => makeScenario(root, 'pnpm-lock.yaml')

  // The patched fixture's bundle additionally carries the patch files, exactly
  // as the auto-include does for a real bundle: pnpm hashes every declared
  // patch file during resolution, so an install without them cannot run at all.
  const makePnpmPatchedScenario = () => makeScenario(PNPM_PATCHED_FIXTURE_ROOT, 'pnpm-lock.yaml', [
    'patches/ms@2.1.3.patch',
    'patches/ee-first@1.1.1.patch',
  ])
  const makeNpmScenario = (root: string = NPM_FIXTURE_ROOT) => makeScenario(root, 'package-lock.json')
  const makeBunScenario = (root: string = BUN_FIXTURE_ROOT) => makeScenario(root, 'bun.lock')
  const makeYarnScenario = (root: string = YARN_FIXTURE_ROOT) => makeScenario(root, 'yarn.lock')
  const makeYarn3Scenario = (root: string = YARN3_FIXTURE_ROOT) => makeScenario(root, 'yarn.lock')

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
      // On win32, node's spawn sorts env keys and deduplicates them
      // case-insensitively keeping the first — uppercase sorts before
      // lowercase, so an ambient case-variant (NPM_CONFIG_REGISTRY on the
      // CI runner) would silently displace the lowercase sentinel below.
      // Drop every ambient variant first so exactly one casing exists.
      const baseEnv = testEnv()
      for (const key of Object.keys(baseEnv)) {
        if (key.toLowerCase() === 'npm_config_registry') {
          delete baseEnv[key]
        }
      }
      await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: {
          ...baseEnv,
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
      // Yarn's network access is always disabled: a stale lockfile would
      // otherwise resolve missing descriptors against the public registry,
      // disclosing private package names. Scripts likewise (defense in
      // depth), and rc loading is pointed at a nonexistent filename so an
      // uncontrolled .yarnrc.yml in an ancestor of the temp dir (e.g. a
      // world-writable /tmp) cannot inject yarnPath code execution or
      // redirect the lockfile write. (YARN_ENABLE_HARDENED_MODE is
      // deliberately NOT set here — yarn 3 rejects the unknown setting —
      // and is covered by the yarn-generation tests instead.)
      expect(childEnv.YARN_ENABLE_NETWORK).toEqual('0')
      expect(childEnv.YARN_ENABLE_SCRIPTS).toEqual('0')
      expect(childEnv.YARN_IGNORE_PATH).toEqual('1')
      // The rc filename must be random so no ancestor .yarnrc.yml can be
      // pre-created under a known name to re-open the yarnPath channel.
      expect(childEnv.YARN_RC_FILENAME).toMatch(/^\.checkly-lockfile-prune-no-rc-[0-9a-f-]+\.yml$/)
      expect(childEnv.YARN_ENABLE_HARDENED_MODE).toBeUndefined()
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

    it('prunes a workspace whose patch applies to nothing once pruned, with real pnpm', async () => {
      const { workspace, files } = makePnpmPatchedScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new PNpmDetector(),
        files,
        env: testEnv(),
      })

      // Without --config.allowUnusedPatches the install aborts with
      // ERR_PNPM_UNUSED_PATCH, because the `ee-first` patch has nothing left to
      // apply to once the member consuming it is pruned away.
      expect(result.status).toEqual('pruned')
      if (result.status !== 'pruned') {
        return
      }

      // The patch that still applies keeps its marker; the one that no longer
      // does loses it. Both declarations survive in the section regardless,
      // because it mirrors the config rather than the dependency graph.
      expect(result.content).toContain('patch_hash=8efb625dd8ccb88e78507bea1f647ed25671bcda20a8554ea02a4122021736bb')
      expect(result.content).not.toContain('patch_hash=90b918fd6167721e405a502ac35adb29ec15497947e9d3b032d6da16a460b4af')
      expect(result.content).toContain('ee-first@1.1.1:')
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

    // The yarn stub scripts below mutate the materialized yarn.lock via the
    // same string-replacement helper as the bun ones. Search strings on the
    // COMMITTED fixture must stay single-line: a Windows checkout may carry
    // CRLF while hand-built lockfiles written by the tests are always LF.

    it('reports a yarn prune with the original content when only backfill is needed', async () => {
      const { workspace, files } = makeYarnScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({ status: 'pruned', archivePath: 'yarn.lock' })
      if (result.status !== 'pruned') {
        return
      }
      expect(result.backfilledManifests).toHaveLength(1)
      expect(JSON.parse(result.backfilledManifests[0].content).name).toEqual('@fixture/absent')
    })

    it('fails when a kept yarn entry changes content', async () => {
      // Any change WITHIN an entry (here the resolved version) makes its
      // serialized value unknown to the original, which the subset check
      // must reject as a fresh resolution.
      const { workspace, files } = makeYarnScenario()
      const script = rewriteYarnLockScript(
        ['version: 2.1.3', 'version: 2.1.4'],
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

    it('fails when the regenerated yarn metadata version is not a supported one', async () => {
      // A different __metadata.version means the lockfile was rewritten by
      // a different yarn generation (e.g. a newer yarn migrating the
      // format); an unknown version fails the allowlist closed.
      const { workspace, files } = makeYarnScenario()
      const script = rewriteYarnLockScript(
        ['version: 10', 'version: 11'],
      )
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('unsupported yarn.lock metadata version 11'),
      })
    })

    it('fails when the yarn metadata version changes between supported versions', async () => {
      const { workspace, files } = makeYarnScenario()
      const script = rewriteYarnLockScript(
        ['version: 10', 'version: 8'],
      )
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('lockfile version changed from 10 to 8'),
      })
    })

    it('skips an unsupported yarn metadata version notably before any command runs', async () => {
      const root = await makeTempDir()
      await fs.cp(YARN_FIXTURE_ROOT, root, { recursive: true })
      const lockfilePath = path.join(root, 'yarn.lock')
      const content = await fs.readFile(lockfilePath, 'utf8')
      // No newline in the search string: a Windows checkout may carry CRLF.
      await fs.writeFile(lockfilePath, content.replace('version: 10', 'version: 11'))
      const { workspace, files } = makeYarnScenario(root)
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('unsupported yarn.lock metadata version 11'),
        notable: true,
      })
    })

    it('skips notably for a yarn metadata version that collides with an Object prototype key', async () => {
      // The version allowlist must fail closed even for a corrupted
      // lockfile whose version equals an inherited property name like
      // 'toString', which a naive `in` check would wrongly accept.
      const root = await makeTempDir()
      await fs.cp(YARN_FIXTURE_ROOT, root, { recursive: true })
      const lockfilePath = path.join(root, 'yarn.lock')
      const content = await fs.readFile(lockfilePath, 'utf8')
      await fs.writeFile(lockfilePath, content.replace('version: 10', 'version: toString'))
      const { workspace, files } = makeYarnScenario(root)
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('unsupported yarn.lock metadata version toString'),
        notable: true,
      })
    })

    it('fails when the yarn cacheKey changes', async () => {
      // The cacheKey names the checksum scheme; a regeneration under a
      // different scheme rewrote every checksum, which is a format change,
      // not a prune.
      const { workspace, files } = makeYarnScenario()
      const script = rewriteYarnLockScript(
        ['cacheKey: 10c0', 'cacheKey: 8'],
      )
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('cacheKey changed from 10c0 to 8'),
      })
    })

    it('accepts a regenerated yarn lockfile that dropped the cacheKey entirely', async () => {
      // Yarn 3 omits the cacheKey when a lockfile resolves no registry
      // packages, which a prune that removes the last registry entry
      // legitimately arrives at — absent-on-one-side must not be treated
      // as a scheme change.
      const { workspace, files } = makeYarnScenario()
      const script = rewriteYarnLockScript(
        ['  cacheKey: 10c0', ''],
      )
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', script])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({ status: 'pruned' })
    })

    it('skips a Yarn Classic lockfile notably', async () => {
      // Realistic Classic content: an entry with a nested `dependencies:`
      // block does NOT parse as YAML (plain scalars followed by a mapping),
      // so Classic must be recognized by its header before parsing — a
      // parse-failure message would wrongly imply a broken lockfile. The
      // skip fires before any command runs.
      const root = await makeTempDir()
      await fs.cp(YARN_FIXTURE_ROOT, root, { recursive: true })
      await fs.writeFile(path.join(root, 'yarn.lock'), `# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
# yarn lockfile v1


debug@4.3.4:
  version "4.3.4"
  resolved "https://registry.yarnpkg.com/debug/-/debug-4.3.4.tgz#1319f6579357f2338d3337d2cdd4914bb5dcc865"
  integrity sha512-PRWFHuSU3eDtQJPvnNY7Jcket1j0t5OuOsFzPPzsekD52Zl8qUfFIPEiswXqIvHWGVHOgX+7G/vCNNhehwxfkQ==
  dependencies:
    ms "2.1.2"

ms@2.1.2:
  version "2.1.2"
  resolved "https://registry.yarnpkg.com/ms/-/ms-2.1.2.tgz#d09d1f357b443f493382a8eb3ccd183872ae6009"
  integrity sha512-sGkPx+VjMtmA6MX27oA4FBFELFCZZ4S4XqeGOXCv68tT+jb3vk/RyaKWP0PTKyWtmLSM0b+adUTEvbs1PEaH2w==
`)
      const { workspace, files } = makeYarnScenario(root)
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('Yarn Classic'),
        notable: true,
      })
    })

    it('fails when a bundled yarn importer disappears from the lockfile', async () => {
      const { workspace, files } = makeYarnScenario()
      const script = rewriteYarnLockScript(
        ['@workspace:packages/used', '@workspace:packages/renamed'],
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

    // Builds a workspace where the `ms` member is consumed through a bare
    // semver range — which yarn keys under BOTH the npm-range descriptor and
    // the workspace descriptor ("ms@npm:^1.0.0, ms@workspace:packages/ms")
    // — AND a same-named registry package is consumed by the root. Link
    // classification for these edges depends entirely on the per-descriptor
    // probe: a name-global answer would misclassify one of the two edges.
    // The isarray entry carries two descriptors so that pruning its second
    // consumer exercises descriptor re-keying (the key shrinks, the value
    // does not). The lockfile is hand-built (always LF) mirroring yarn
    // 4.18.0's real layout for this shape.
    const makeMixedYarnScenario = async () => {
      const root = await makeTempDir()
      await fs.mkdir(path.join(root, 'packages/a'), { recursive: true })
      await fs.mkdir(path.join(root, 'packages/ms'), { recursive: true })
      await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
        name: 'mixed-yarn-fixture',
        private: true,
        workspaces: ['packages/*'],
        dependencies: { isarray: '2.0.5', ms: '2.1.3' },
      }))
      await fs.writeFile(path.join(root, 'packages/a/package.json'), JSON.stringify({
        name: 'a',
        version: '1.0.0',
        dependencies: { isarray: '^2.0.0', ms: '^1.0.0' },
      }))
      await fs.writeFile(path.join(root, 'packages/ms/package.json'), JSON.stringify({
        name: 'ms',
        version: '1.0.0',
      }))
      await fs.writeFile(path.join(root, 'yarn.lock'), `__metadata:
  version: 10
  cacheKey: 10c0

"a@workspace:packages/a":
  version: 0.0.0-use.local
  resolution: "a@workspace:packages/a"
  dependencies:
    isarray: "npm:^2.0.0"
    ms: "npm:^1.0.0"
  languageName: unknown
  linkType: soft

"isarray@npm:2.0.5, isarray@npm:^2.0.0":
  version: 2.0.5
  resolution: "isarray@npm:2.0.5"
  checksum: 10c0/iii
  languageName: node
  linkType: hard

"mixed-yarn-fixture@workspace:.":
  version: 0.0.0-use.local
  resolution: "mixed-yarn-fixture@workspace:."
  dependencies:
    isarray: "npm:2.0.5"
    ms: "npm:2.1.3"
  languageName: unknown
  linkType: soft

"ms@npm:2.1.3":
  version: 2.1.3
  resolution: "ms@npm:2.1.3"
  checksum: 10c0/mmm
  languageName: node
  linkType: hard

"ms@npm:^1.0.0, ms@workspace:packages/ms":
  version: 0.0.0-use.local
  resolution: "ms@workspace:packages/ms"
  languageName: unknown
  linkType: soft
`)

      const a = new Package({ name: 'a', path: path.join(root, 'packages/a'), version: '1.0.0' })
      const msMember = new Package({ name: 'ms', path: path.join(root, 'packages/ms'), version: '1.0.0' })
      const workspace = new Workspace({
        root: new Package({ name: 'mixed-yarn-fixture', path: root }),
        packages: [a, msMember],
        lockfile: Ok(path.join(root, 'yarn.lock')),
        configFile: Err(new Error('no config file')),
      })
      const files = new Map<string, File>([
        ['package.json', { filePath: path.join(root, 'package.json'), physical: true }],
        ['yarn.lock', { filePath: path.join(root, 'yarn.lock'), physical: true }],
        ['packages/a/package.json', { filePath: path.join(root, 'packages/a/package.json'), physical: true }],
        // The ms member's manifest is deliberately not in the bundle.
      ])
      return { workspace, files, a }
    }

    it('backfills a yarn member consumed through a bare semver range', async () => {
      const { workspace, files } = await makeMixedYarnScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      // The manifest spec is '^1.0.0', not 'workspace:*', so the backfill
      // can only trigger through the lockfile's per-descriptor link
      // resolution (the "ms@npm:^1.0.0" descriptor resolving to a workspace
      // entry), never through the spec prefix.
      expect(result).toMatchObject({ status: 'pruned' })
      if (result.status !== 'pruned') {
        return
      }
      expect(result.backfilledManifests).toHaveLength(1)
      expect(JSON.parse(result.backfilledManifests[0].content).name).toEqual('ms')
    })

    it('fails when a bare-semver yarn workspace resolution becomes a registry package', async () => {
      // The yarn analog of npm's silent registry substitution: the npm-range
      // descriptor no longer resolves to the workspace entry, so the edge
      // that used to be a link is not one anymore.
      const { workspace, files } = await makeMixedYarnScenario()
      const script = rewriteYarnLockScript(
        ['"ms@npm:^1.0.0, ms@workspace:packages/ms":', '"ms@workspace:packages/ms":'],
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

    it('does not mistake a yarn registry edge for a link when the same-named member is unlinked by a prune', async () => {
      // With member a shimmed to a dependency-free manifest, pruning
      // legitimately drops a's edges, the npm-range descriptor on the ms
      // member's key, and isarray's second descriptor — while the root keeps
      // its registry ms and isarray. A name-global link classification would
      // mark the root's registry ms edge as a link in the original and fail
      // verification with a spurious "no longer a workspace link"; a
      // key-based subset check would reject the shrunk isarray key despite
      // its unchanged value. The per-descriptor probe and the value-based
      // subset check must both accept this prune.
      const { workspace, files, a } = await makeMixedYarnScenario()
      files.set('packages/a/package.json', createFauxPackageFiles(a)[0])
      const script = rewriteYarnLockScript(
        ['"ms@npm:^1.0.0, ms@workspace:packages/ms":', '"ms@workspace:packages/ms":'],
        ['"isarray@npm:2.0.5, isarray@npm:^2.0.0":', '"isarray@npm:2.0.5":'],
        ['\n  dependencies:\n    isarray: "npm:^2.0.0"\n    ms: "npm:^1.0.0"', ''],
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
      expect(result.content).not.toContain('ms@npm:^1.0.0')
      expect(result.content).toContain('ms@npm:2.1.3')
    })

    // Builds a workspace where member a peer-depends on the core member with
    // the same bare range that member b really depends on, so the lockfile
    // keys core's entry under the shared range descriptor — and b is shimmed
    // away in the bundle, so a realistic regeneration drops both b's edge
    // and the shared descriptor while a's peer stays recorded (peers are
    // manifest echoes, never resolved on their own). Peer edges must
    // therefore never be probed against descriptors: classifying a's peer
    // edge as a link in the original would fail this correct prune with a
    // spurious 'no longer a workspace link'. Parameterized by lockfile
    // generation, because the descriptor/spec spelling differs: metadata
    // version 6 (yarn 3) records bare ranges, 8+ record the npm: protocol.
    const makeSharedPeerDescriptorScenario = async (
      metadataVersion: number, cacheKey: string, specPrefix: string,
    ) => {
      const root = await makeTempDir()
      await fs.mkdir(path.join(root, 'packages/a'), { recursive: true })
      await fs.mkdir(path.join(root, 'packages/b'), { recursive: true })
      await fs.mkdir(path.join(root, 'packages/core'), { recursive: true })
      await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
        name: 'peer-yarn-fixture',
        private: true,
        workspaces: ['packages/*'],
        dependencies: { a: 'workspace:*', b: 'workspace:*' },
      }))
      await fs.writeFile(path.join(root, 'packages/a/package.json'), JSON.stringify({
        name: 'a',
        version: '1.0.0',
        peerDependencies: { core: '^1.0.0' },
      }))
      await fs.writeFile(path.join(root, 'packages/b/package.json'), JSON.stringify({
        name: 'b',
        version: '1.0.0',
        dependencies: { core: '^1.0.0' },
      }))
      await fs.writeFile(path.join(root, 'packages/core/package.json'), JSON.stringify({
        name: 'core',
        version: '1.0.0',
      }))
      const coreSpec = specPrefix === '' ? '^1.0.0' : `"${specPrefix}^1.0.0"`
      await fs.writeFile(path.join(root, 'yarn.lock'), `__metadata:
  version: ${metadataVersion}
  cacheKey: ${cacheKey}

"a@workspace:*, a@workspace:packages/a":
  version: 0.0.0-use.local
  resolution: "a@workspace:packages/a"
  peerDependencies:
    core: ^1.0.0
  languageName: unknown
  linkType: soft

"b@workspace:*, b@workspace:packages/b":
  version: 0.0.0-use.local
  resolution: "b@workspace:packages/b"
  dependencies:
    core: ${coreSpec}
  languageName: unknown
  linkType: soft

"core@${specPrefix}^1.0.0, core@workspace:packages/core":
  version: 0.0.0-use.local
  resolution: "core@workspace:packages/core"
  languageName: unknown
  linkType: soft

"peer-yarn-fixture@workspace:.":
  version: 0.0.0-use.local
  resolution: "peer-yarn-fixture@workspace:."
  dependencies:
    a: "workspace:*"
    b: "workspace:*"
  languageName: unknown
  linkType: soft
`)
      const a = new Package({ name: 'a', path: path.join(root, 'packages/a'), version: '1.0.0' })
      const b = new Package({ name: 'b', path: path.join(root, 'packages/b'), version: '1.0.0' })
      const core = new Package({ name: 'core', path: path.join(root, 'packages/core'), version: '1.0.0' })
      const workspace = new Workspace({
        root: new Package({ name: 'peer-yarn-fixture', path: root }),
        packages: [a, b, core],
        lockfile: Ok(path.join(root, 'yarn.lock')),
        configFile: Err(new Error('no config file')),
      })
      const files = new Map<string, File>([
        ['package.json', { filePath: path.join(root, 'package.json'), physical: true }],
        ['yarn.lock', { filePath: path.join(root, 'yarn.lock'), physical: true }],
        ['packages/a/package.json', { filePath: path.join(root, 'packages/a/package.json'), physical: true }],
        ['packages/b/package.json', createFauxPackageFiles(b)[0]],
        // The core member's manifest is deliberately not in the bundle: it
        // must be backfilled through b's real dependency edge.
      ])
      // Simulates the realistic regeneration: the shared descriptor and b's
      // dependency block disappear.
      const script = rewriteYarnLockScript(
        [`"core@${specPrefix}^1.0.0, core@workspace:packages/core":`, '"core@workspace:packages/core":'],
        [`\n  dependencies:\n    core: ${coreSpec}`, ''],
      )
      return { workspace, files, script }
    }

    const expectPeerPruneAccepted = async (
      scenario: { workspace: Workspace, files: Map<string, File>, script: string },
    ) => {
      const result = await pruneBundledLockfile({
        workspace: scenario.workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', scenario.script])),
        files: scenario.files,
        env: testEnv(),
      })
      expect(result).toMatchObject({ status: 'pruned' })
      if (result.status !== 'pruned') {
        return
      }
      expect(result.backfilledManifests).toHaveLength(1)
      expect(JSON.parse(result.backfilledManifests[0].content).name).toEqual('core')
    }

    it('accepts a prune that unlinks a peer edge sharing a descriptor with a pruned dependency', async () => {
      await expectPeerPruneAccepted(await makeSharedPeerDescriptorScenario(10, '10c0', 'npm:'))
    })

    it('handles yarn 3 (metadata version 6) lockfiles, whose specs carry no npm: prefix', async () => {
      // The as-written probe must classify b's prefix-less dependency edge
      // as a link (backfilling core through it) on yarn 3 shapes too.
      await expectPeerPruneAccepted(await makeSharedPeerDescriptorScenario(6, '8', ''))
    })

    it('classifies a bare numeric yarn 3 range that YAML would coerce to a number', async () => {
      // Yarn 3 writes bare numeric ranges unquoted (`two: 2`), which the
      // default YAML schema turns into a number; the parser must read the
      // lockfile with the failsafe schema so the edge survives, resolves
      // to the workspace descriptor and triggers the backfill.
      const root = await makeTempDir()
      await fs.mkdir(path.join(root, 'packages/a'), { recursive: true })
      await fs.mkdir(path.join(root, 'packages/two'), { recursive: true })
      await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
        name: 'numeric-fixture',
        private: true,
        workspaces: ['packages/*'],
        dependencies: { a: 'workspace:*' },
      }))
      await fs.writeFile(path.join(root, 'packages/a/package.json'), JSON.stringify({
        name: 'a',
        version: '1.0.0',
        dependencies: { two: '2' },
      }))
      await fs.writeFile(path.join(root, 'packages/two/package.json'), JSON.stringify({
        name: 'two',
        version: '2.0.0',
      }))
      await fs.writeFile(path.join(root, 'yarn.lock'), `__metadata:
  version: 6
  cacheKey: 8

"a@workspace:*, a@workspace:packages/a":
  version: 0.0.0-use.local
  resolution: "a@workspace:packages/a"
  dependencies:
    two: 2
  languageName: unknown
  linkType: soft

"numeric-fixture@workspace:.":
  version: 0.0.0-use.local
  resolution: "numeric-fixture@workspace:."
  dependencies:
    a: "workspace:*"
  languageName: unknown
  linkType: soft

"two@2, two@workspace:packages/two":
  version: 0.0.0-use.local
  resolution: "two@workspace:packages/two"
  languageName: unknown
  linkType: soft
`)
      const a = new Package({ name: 'a', path: path.join(root, 'packages/a'), version: '1.0.0' })
      const two = new Package({ name: 'two', path: path.join(root, 'packages/two'), version: '2.0.0' })
      const workspace = new Workspace({
        root: new Package({ name: 'numeric-fixture', path: root }),
        packages: [a, two],
        lockfile: Ok(path.join(root, 'yarn.lock')),
        configFile: Err(new Error('no config file')),
      })
      const files = new Map<string, File>([
        ['package.json', { filePath: path.join(root, 'package.json'), physical: true }],
        ['yarn.lock', { filePath: path.join(root, 'yarn.lock'), physical: true }],
        ['packages/a/package.json', { filePath: path.join(root, 'packages/a/package.json'), physical: true }],
        // The two member's manifest is deliberately not in the bundle: the
        // backfill can only trigger through the numeric-range edge.
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
      expect(JSON.parse(result.backfilledManifests[0].content).name).toEqual('two')
    })

    it('skips notably when a yarn entry has an unexpected shape', async () => {
      // The per-entry shape check is a load-bearing fail-closed guard: a
      // future format that restructures entries must skip, not silently
      // produce an empty snapshot.
      const root = await makeTempDir()
      await fs.cp(YARN_FIXTURE_ROOT, root, { recursive: true })
      const lockfilePath = path.join(root, 'yarn.lock')
      const content = await fs.readFile(lockfilePath, 'utf8')
      // No newline in the search string: a Windows checkout may carry CRLF.
      await fs.writeFile(lockfilePath, content.replace('  resolution: "ms@npm:2.1.3"', ''))
      const { workspace, files } = makeYarnScenario(root)
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: stubPackageManager(new Runnable('node', ['-e', ''])),
        files,
        env: testEnv(),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('unsupported yarn.lock entry shape'),
        notable: true,
      })
    })

    it('backfills a yarn member consumed through the portal: protocol', async () => {
      // portal:/link: specs count as links via their prefix (their entries
      // have no @workspace: resolution to probe).
      const root = await makeTempDir()
      await fs.mkdir(path.join(root, 'packages/x'), { recursive: true })
      await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
        name: 'portal-root',
        private: true,
        dependencies: { x: 'portal:./packages/x' },
      }))
      await fs.writeFile(path.join(root, 'packages/x/package.json'), JSON.stringify({
        name: 'x',
        version: '1.0.0',
      }))
      await fs.writeFile(path.join(root, 'yarn.lock'), `__metadata:
  version: 10
  cacheKey: 10c0

"portal-root@workspace:.":
  version: 0.0.0-use.local
  resolution: "portal-root@workspace:."
  dependencies:
    x: "portal:./packages/x"
  languageName: unknown
  linkType: soft

"x@portal:./packages/x::locator=portal-root%40workspace%3A.":
  version: 0.0.0-use.local
  resolution: "x@portal:./packages/x::locator=portal-root%40workspace%3A."
  languageName: node
  linkType: soft
`)
      const x = new Package({ name: 'x', path: path.join(root, 'packages/x'), version: '1.0.0' })
      const workspace = new Workspace({
        root: new Package({ name: 'portal-root', path: root }),
        packages: [x],
        lockfile: Ok(path.join(root, 'yarn.lock')),
        configFile: Err(new Error('no config file')),
      })
      const files = new Map<string, File>([
        ['package.json', { filePath: path.join(root, 'package.json'), physical: true }],
        ['yarn.lock', { filePath: path.join(root, 'yarn.lock'), physical: true }],
        // The x member's manifest is deliberately not in the bundle.
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
      expect(JSON.parse(result.backfilledManifests[0].content).name).toEqual('x')
    })

    it('keeps a yarn patch: entry intact through a prune', async () => {
      // patch: entries are ordinary non-workspace entries in the subset
      // set; a prune that leaves them untouched must pass verification
      // with the patched resolution intact.
      const root = await makeTempDir()
      await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
        name: 'patch-root',
        private: true,
        dependencies: { isarray: '2.0.5', ms: 'patch:ms@npm%3A2.1.3#~/.yarn/patches/ms.patch' },
      }))
      await fs.writeFile(path.join(root, 'yarn.lock'), `__metadata:
  version: 10
  cacheKey: 10c0

"isarray@npm:2.0.5":
  version: 2.0.5
  resolution: "isarray@npm:2.0.5"
  checksum: 10c0/iii
  languageName: node
  linkType: hard

"ms@npm:2.1.3":
  version: 2.1.3
  resolution: "ms@npm:2.1.3"
  checksum: 10c0/mmm
  languageName: node
  linkType: hard

"ms@patch:ms@npm%3A2.1.3#~/.yarn/patches/ms.patch":
  version: 2.1.3
  resolution: "ms@patch:ms@npm%3A2.1.3#~/.yarn/patches/ms.patch::version=2.1.3&hash=125495"
  checksum: 10c0/ppp
  languageName: node
  linkType: hard

"patch-root@workspace:.":
  version: 0.0.0-use.local
  resolution: "patch-root@workspace:."
  dependencies:
    isarray: "npm:2.0.5"
    ms: "patch:ms@npm%3A2.1.3#~/.yarn/patches/ms.patch"
  languageName: unknown
  linkType: soft
`)
      const member = new Package({ name: 'unused-member', path: path.join(root, 'packages/none'), version: '1.0.0' })
      const workspace = new Workspace({
        root: new Package({ name: 'patch-root', path: root }),
        packages: [member],
        lockfile: Ok(path.join(root, 'yarn.lock')),
        configFile: Err(new Error('no config file')),
      })
      const files = new Map<string, File>([
        ['package.json', { filePath: path.join(root, 'package.json'), physical: true }],
        ['yarn.lock', { filePath: path.join(root, 'yarn.lock'), physical: true }],
      ])
      const script = rewriteYarnLockScript(
        ['"isarray@npm:2.0.5":\n  version: 2.0.5\n  resolution: "isarray@npm:2.0.5"\n  checksum: 10c0/iii\n  languageName: node\n  linkType: hard\n\n', ''],
        ['\n    isarray: "npm:2.0.5"', ''],
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
      expect(result.content).toContain('ms@patch:ms@npm%3A2.1.3')
      expect(result.content).not.toContain('isarray')
    })

    // Writes a fake `yarn` (POSIX shell script) onto a fresh PATH dir and
    // returns the env to hand the pruner. `versionBody` runs for
    // `yarn --version`, `installBody` for everything else; the default
    // install body fails, so a test asserting a pre-spawn skip would see a
    // 'failed' result instead if the install were (wrongly) reached.
    const makeFakeYarnEnv = async (
      versionBody: string,
      installBody = 'exit 1',
    ): Promise<NodeJS.ProcessEnv> => {
      const binDir = await makeTempDir()
      const fakeYarn = path.join(binDir, 'yarn')
      await fs.writeFile(fakeYarn, `#!/bin/sh\nif [ "$1" = "--version" ]; then ${versionBody}; fi\n${installBody}\n`)
      await fs.chmod(fakeYarn, 0o755)
      return { ...testEnv(), PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` }
    }

    it.skipIf(process.platform === 'win32')('skips notably when yarn resolves to Yarn Classic', async () => {
      // The pruner must refuse BEFORE spawning the install: Classic
      // silently ignores --mode=update-lockfile and performs a full
      // install, scripts included.
      const { workspace, files } = makeYarnScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new YarnDetector(),
        files,
        env: await makeFakeYarnEnv('echo 1.22.22; exit 0'),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('Yarn Classic (1.x)'),
        notable: true,
      })
    })

    it.skipIf(process.platform !== 'win32')('skips notably when yarn resolves to Yarn Classic on Windows', async () => {
      // The Windows variant matters in its own right: the guard must
      // resolve a `yarn.cmd` shim (which shell-less spawns cannot) and
      // tolerate CRLF-terminated probe output. `%~1` strips the quotes
      // cross-spawn wraps every cmd.exe argument in, so the shim matches
      // `--version` exactly as the real corepack yarn.cmd (which forwards
      // %* to node, whose argv parser strips them) would.
      const binDir = await makeTempDir()
      await fs.writeFile(
        path.join(binDir, 'yarn.cmd'),
        '@echo off\r\nif "%~1"=="--version" (\r\n  echo 1.22.22\r\n  exit /b 0\r\n)\r\nexit /b 1\r\n',
      )
      const { workspace, files } = makeYarnScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new YarnDetector(),
        files,
        env: { ...testEnv(), PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` },
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('Yarn Classic (1.x)'),
        notable: true,
      })
    })

    it.skipIf(process.platform === 'win32')('attempts the install when the yarn version probe fails', async () => {
      // The probe fails OPEN by design: an unidentifiable yarn must not
      // block a working prune, and the install's own error carries the
      // real detail. This pins the choice; the trade-off (a Classic yarn
      // whose --version somehow fails would still install) is accepted.
      // The ambient PATH is stubbed too: the post-failure missing-binary
      // classification (PathLookup) reads process.env, and this test must
      // not depend on the host having a real yarn there.
      const { workspace, files } = makeYarnScenario()
      const env = await makeFakeYarnEnv('echo probe broken >&2; exit 7', 'echo install ran >&2; exit 9')
      vi.stubEnv('PATH', env.PATH!)
      try {
        const result = await pruneBundledLockfile({
          workspace,
          packageManager: new YarnDetector(),
          files,
          env,
        })
        expect(result).toMatchObject({
          status: 'failed',
          reason: expect.stringContaining('install ran'),
        })
      } finally {
        vi.unstubAllEnvs()
      }
    })

    it.skipIf(process.platform === 'win32')('skips notably when the yarn generation does not match the lockfile', async () => {
      // Yarn only reuses a lockfile written by its own generation; handed
      // an older one it re-resolves everything, which the network guard
      // blocks. The version mismatch must surface as an actionable skip,
      // not a blocked-registry failure. A yarn-3 lockfile with a yarn-4
      // binary:
      const { workspace, files } = makeYarn3Scenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new YarnDetector(),
        files,
        env: await makeFakeYarnEnv('echo 4.18.0; exit 0'),
      })
      expect(result).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('written by yarn 3 (metadata version 6) but yarn resolves to 4.18.0'),
        notable: true,
      })
    })

    it.skipIf(process.platform === 'win32')('disables hardened mode only for a confirmed yarn 4', async () => {
      // YARN_ENABLE_HARDENED_MODE must reach a yarn-4 install (hardened
      // mode is auto-enabled on PR CI and would trip the network guard),
      // but must NOT be set for yarn 3, which rejects the unknown setting
      // with a usage error.
      // POSIX-gated test, so the temp path is already shell-safe.
      const outFile = path.join(await makeTempDir(), 'env.txt')
      const recordEnv = `echo "hardened=$YARN_ENABLE_HARDENED_MODE" > "${outFile}"; exit 1`

      const v10 = makeYarnScenario()
      await pruneBundledLockfile({
        workspace: v10.workspace,
        packageManager: new YarnDetector(),
        files: v10.files,
        env: await makeFakeYarnEnv('echo 4.18.0; exit 0', recordEnv),
      })
      expect((await fs.readFile(outFile, 'utf8')).trim()).toEqual('hardened=0')

      const v6 = makeYarn3Scenario()
      await pruneBundledLockfile({
        workspace: v6.workspace,
        packageManager: new YarnDetector(),
        files: v6.files,
        env: await makeFakeYarnEnv('echo 3.8.7; exit 0', recordEnv),
      })
      expect((await fs.readFile(outFile, 'utf8')).trim()).toEqual('hardened=')
    })

    it.skipIf(process.platform === 'win32')('fails clearly when the prune timeout is below the yarn floor', async () => {
      // A caller-supplied timeout too small to run any install (the version
      // probe returns instantly, so the budget itself is the problem) is
      // reported as a misconfiguration, not a toolchain-provisioning delay.
      const { workspace, files } = makeYarnScenario()
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new YarnDetector(),
        files,
        env: await makeFakeYarnEnv('echo 4.18.0; exit 0'),
        timeoutMs: 100,
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('below the minimum needed to run yarn'),
      })
    })

    it.skipIf(process.platform === 'win32')('fails clearly when the yarn version probe eats the prune budget', async () => {
      // A probe (e.g. a first-use corepack download) slow enough to leave
      // less than the install floor is attributed to provisioning, not a
      // second install timeout.
      const { workspace, files } = makeYarnScenario()
      // The probe sleeps well within the timeout (so it never itself times
      // out) but leaves under the 1s install floor: timeout 3000 − ~1500
      // sleep = ~1500 remaining is above the floor's own comparison only
      // if the sleep is longer, so sleep 2.2s → ~800ms remaining.
      const result = await pruneBundledLockfile({
        workspace,
        packageManager: new YarnDetector(),
        files,
        env: await makeFakeYarnEnv('sleep 2.2; echo 4.18.0; exit 0'),
        timeoutMs: 3000,
      })
      expect(result).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('provisioning the yarn toolchain used up the prune time budget'),
      })
    }, 15_000)

    // The network guard's own error names the user's "configuration
    // settings", which reads like a broken setup; the pruner must name the
    // real causes (stale lockfile, or a same-generation yarn that still
    // declines to reuse it) instead. Real yarn prints YN0080 on STDOUT, but
    // an install that also emits unrelated stderr must still be recognized,
    // so the rewrite scans both streams. The ambient PATH is stubbed for
    // the same reason as in the probe-failure test above.
    const blockedMessage =
      `YN0080: ms@npm:2.1.3: Request to 'https://registry.yarnpkg.com/ms' has been blocked because of your configuration settings`
    for (const stream of ['stdout', 'stdout-with-stderr-noise']) {
      it.skipIf(process.platform === 'win32')(
        `rewrites yarn blocked-request failures into an actionable reason (${stream})`, async () => {
          const { workspace, files } = makeYarnScenario()
          const noise = stream === 'stdout-with-stderr-noise' ? 'echo "warning: some unrelated notice" >&2; ' : ''
          const env = await makeFakeYarnEnv('echo 4.18.0; exit 0', `${noise}echo "${blockedMessage}"; exit 1`)
          vi.stubEnv('PATH', env.PATH!)
          try {
            const result = await pruneBundledLockfile({
              workspace,
              packageManager: new YarnDetector(),
              files,
              env,
            })
            expect(result).toMatchObject({
              status: 'failed',
              reason: expect.stringContaining('pin it via the packageManager field'),
            })
            if (result.status !== 'failed') {
              return
            }
            // Yarn's own output stays attached (the descriptor is otherwise
            // unrecoverable), but only after the actionable explanation.
            expect(result.reason.indexOf('pin it via')).toBeLessThan(result.reason.indexOf('YN0080'))
          } finally {
            vi.unstubAllEnvs()
          }
        })
    }

    // Both real-yarn generations run the same end-to-end shape; the only
    // differences are the fixture (and hence the pinned yarn) and the
    // checksum spelling (yarn 3 writes bare hex without the cacheKey
    // prefix). Environment-level incompatibilities have already differed
    // between the generations (the hardened-mode setting does not exist
    // before yarn 4), so both must stay covered.
    for (const generation of [
      {
        name: 'yarn 4',
        fixture: 'yarn-workspace',
        makeScenario: makeYarnScenario,
        available: yarnBerryAvailable,
        checksumMarker: 'checksum: 10c0/',
      },
      {
        name: 'yarn 3',
        fixture: 'yarn3-workspace',
        makeScenario: makeYarn3Scenario,
        available: yarn3Available,
        checksumMarker: 'checksum:',
      },
    ]) {
      it.skipIf(process.env.CHECKLY_EXPECT_YARN === undefined)(
        `${generation.name} is provisioned when CHECKLY_EXPECT_YARN is set`, () => {
          // The repo's own CI workflow sets CHECKLY_EXPECT_YARN after
          // running `corepack enable yarn` and pre-downloading both pinned
          // versions. The probe checks the resolved major from the fixture
          // directory, so a preinstalled Yarn Classic shadowing the
          // corepack shim fails here instead of silently skipping the
          // real-yarn tests below.
          expect(
            generation.available,
            `CHECKLY_EXPECT_YARN is set but yarn does not resolve to the ${generation.fixture}`
            + ` fixture's pinned version, so the real-${generation.name} pruner tests were skipped.`
            + ' Restore the `corepack enable yarn` step in .github/workflows/test.yml.',
          ).toBe(true)
        })

      it.skipIf(!generation.available)(
        `prunes the lockfile with real ${generation.name}, backfilling link-referenced members`, async () => {
          const { workspace, files } = generation.makeScenario()
          const result = await pruneBundledLockfile({
            workspace,
            packageManager: new YarnDetector(),
            files,
            env: testEnv(),
          })

          expect(result.status).toEqual('pruned')
          if (result.status !== 'pruned') {
            return
          }

          expect(result.archivePath).toEqual('yarn.lock')

          // The root manifest declares @fixture/absent as workspace:*, so a
          // faux manifest must have been backfilled for it.
          expect(result.backfilledManifests).toHaveLength(1)
          expect(JSON.parse(result.backfilledManifests[0].content)).toMatchObject({
            name: '@fixture/absent',
            version: '1.0.0',
          })

          // Kept: every workspace member entry (the shimmed and backfilled
          // members keep dependency-free importers) and the imported
          // member's dependency with its checksum. Byte-identity of kept
          // entries is guaranteed by the pruned status (the value-based
          // subset check).
          expect(result.content).toContain('@fixture/used@workspace:packages/used')
          expect(result.content).toContain('@fixture/shimmed@workspace:packages/shimmed')
          expect(result.content).toContain('@fixture/absent@workspace:packages/absent')
          expect(result.content).toContain('ms@npm:2.1.3')
          expect(result.content).toContain(generation.checksumMarker)

          // Dropped: dependencies of the shimmed and absent members.
          expect(result.content).not.toContain('isarray')
          expect(result.content).not.toContain('ee-first')
        }, 60_000)
    }
  })
})
