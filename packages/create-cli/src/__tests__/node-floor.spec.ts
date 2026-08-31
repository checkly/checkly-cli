import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { parse } from 'acorn'
import { describe, it, expect } from 'vitest'

import { belowMinimumVersion, minimumVersion } from '../../bin/check-node-version.cjs'

// The minimum supported Node version is declared in three independent places:
// engines.node in both published packages, and the preflight constant in
// bin/check-node-version.cjs (which cannot read package.json because it must
// run before any dependency is guaranteed to be installed). Nothing else
// keeps them aligned, so assert it here to stop a future floor bump from
// moving one and silently leaving the others behind. The checkly package's
// own node-floor spec pins its preflight constant to its engines.node, so
// the cross-package equality below closes the loop.
describe('Node version floor', () => {
  const packageDir = path.join(import.meta.dirname, '..', '..')

  function readPackageJson (dir: string) {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  }

  const packageJson = readPackageJson(packageDir)
  const createCliEngines: string = packageJson.engines.node

  function readBin (file: string): string {
    return fs.readFileSync(path.join(packageDir, 'bin', file), 'utf8')
  }

  function stripLineComments (source: string): string {
    return source.replace(/^\s*\/\/.*$/gm, '')
  }

  it('declares the same engines.node in checkly and create-checkly', () => {
    const cliEngines = readPackageJson(path.join(packageDir, '..', 'cli')).engines.node
    expect(createCliEngines).toEqual(cliEngines)
  })

  it('keeps the version-check helper identical to the checkly package copy', () => {
    // The preflight logic is duplicated per package (each ships its own bin/),
    // so a behavioral fix applied to one copy must not silently skip the other.
    const cliHelper = fs.readFileSync(path.join(packageDir, '..', 'cli', 'bin', 'check-node-version.cjs'), 'utf8')
    expect(readBin('check-node-version.cjs')).toEqual(cliHelper)
  })

  it('uses the engines.node minimum in the bin preflight', () => {
    const enginesMinimum = createCliEngines.match(/^>=(\d+\.\d+\.\d+)$/)?.[1]
    expect(enginesMinimum).toBeDefined()
    expect(minimumVersion).toEqual(enginesMinimum)
  })

  it('points the published bin at the preflight entry', () => {
    expect(packageJson.bin['create-cli']).toEqual('./bin/run.cjs')
  })

  it.each([
    ['18.20.0', true],
    ['20.19.5', true],
    ['22.12.9', true],
    ['22.13.0', false],
    ['22.13.1', false],
    ['22.14.0', false],
    ['23.0.0', false],
    ['24.1.0', false],
    // Prerelease suffixes are stripped, so a prerelease judges the same as
    // the release version it is based on.
    ['22.12.9-rc.1', true],
    ['23.0.0-nightly20250101abcdef', false],
  ])('judges Node %s as below the minimum supported version: %s', (version, below) => {
    expect(belowMinimumVersion(version)).toEqual(below)
  })

  it.each([
    ['run.cjs'],
    ['check-node-version.cjs'],
  ])('keeps bin/%s parseable as an old CommonJS script', file => {
    // Both files are parsed before the version check can run, so they must
    // load on runtimes old enough to need the version message. sourceType
    // 'script' rejects any static import/export, and the low ecmaVersion
    // rejects dynamic import() expressions and other modern syntax.
    expect(() => parse(readBin(file), {
      ecmaVersion: 2017,
      sourceType: 'script',
      allowHashBang: true,
    })).not.toThrow()
  })

  it('requires only dependency-free siblings before the version check', () => {
    // Requiring anything outside bin/ from the entry would evaluate code that
    // unsupported runtimes may not be able to load.
    const binRun = stripLineComments(readBin('run.cjs'))
    const requires = [...binRun.matchAll(/require\(([^)]*)\)/g)].map(match => match[1])
    expect(requires).toEqual(['\'./check-node-version.cjs\'', '\'./launch.cjs\''])
    expect(stripLineComments(readBin('check-node-version.cjs'))).not.toMatch(/\brequire\(/)
  })

  it('loads the CLI only via dynamic import after the version check', () => {
    // require() of @oclif/core would break if its graph ever adopted
    // top-level await, so the launcher must use dynamic import.
    const launch = readBin('launch.cjs')
    expect(launch).toMatch(/await import\('@oclif\/core'\)/)
    expect(stripLineComments(launch)).not.toMatch(/\brequire\(/)
  })

  function runBinWithPatchedVersions (
    patches: Record<string, string | undefined>,
    args: string[],
    extraEnv: Record<string, string> = {},
  ) {
    // The child runs the real CLI once the preflight passes, which needs a
    // built dist/ — fail clearly instead of with opaque exit-code mismatches.
    if (!fs.existsSync(path.join(packageDir, 'dist'))) {
      throw new Error('dist/ is missing — run `pnpm --filter create-checkly run prepare` first')
    }
    const runPath = path.join(packageDir, packageJson.bin['create-cli'])
    // Plain assignment to process.versions properties is a silent no-op
    // (they are defined non-writable), so patching needs defineProperty.
    const patchScript = Object.entries(patches)
      .map(([key, value]) => value === undefined
        ? `delete process.versions.${key};`
        : `Object.defineProperty(process.versions, '${key}', `
          + `{ value: ${JSON.stringify(value)}, configurable: true });`)
      .join('')
    const script = patchScript
      + `process.argv = [process.argv[0], ${JSON.stringify(runPath)}, ...${JSON.stringify(args)}];`
      + `require(${JSON.stringify(runPath)})`
    const env = { ...process.env }
    delete env.CHECKLY_SKIP_NODE_VERSION_CHECK
    // Keep the child hermetic: --help runs oclif's init hooks, and without
    // this @oclif/plugin-warn-if-update-available spawns a detached npm
    // registry refresh from every spawn test.
    env.CREATE_CLI_SKIP_NEW_VERSION_CHECK = '1'
    Object.assign(env, extraEnv)
    return spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env })
  }

  it('blocks a Node version below the floor with a friendly message', () => {
    const result = runBinWithPatchedVersions({ node: '18.20.5' }, [])
    expect(result.status).toEqual(1)
    expect(result.stderr).toContain(
      `You are running Node.js v18.20.5. create-checkly requires Node.js v${minimumVersion} or higher.`,
    )
  })

  it.each([
    ['bun', '1.2.0'],
    ['deno', '2.0.0'],
  ])('lets %s through even when its pinned Node version is below the floor', (runtime, version) => {
    const result = runBinWithPatchedVersions({ node: '18.20.5', [runtime]: version }, ['--help'])
    expect(result.stderr).not.toContain('requires Node.js')
    expect(result.status).toEqual(0)
    expect(result.stdout).toContain('USAGE')
  })

  it('lets a runtime without a reported Node version through', () => {
    const result = runBinWithPatchedVersions({ node: undefined }, ['--help'])
    // Only the non-blocking contract is asserted: oclif itself reads
    // process.versions.node during startup, so this synthetic child cannot
    // run the CLI to a clean exit. The preflight must neither block nor
    // crash — a thrown TypeError would put its own file in the stack trace.
    expect(result.stderr).not.toContain('requires Node.js')
    expect(result.stderr).not.toContain('check-node-version.cjs')
  })

  it('skips the check when CHECKLY_SKIP_NODE_VERSION_CHECK=1 is set', () => {
    const result = runBinWithPatchedVersions({ node: '18.20.5' }, ['--help'], {
      CHECKLY_SKIP_NODE_VERSION_CHECK: '1',
    })
    expect(result.stderr).not.toContain('requires Node.js')
    expect(result.status).toEqual(0)
    expect(result.stdout).toContain('USAGE')
  })
})
