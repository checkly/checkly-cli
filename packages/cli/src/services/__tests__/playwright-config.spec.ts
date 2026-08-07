import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PlaywrightConfig } from '../playwright-config.js'
import { describe, it, expect, afterEach } from 'vitest'
import { Session } from '../../constructs/index.js'

const fixturesPath = path.join(__dirname, 'fixtures', 'playwright-configs')

const sandboxes: string[] = []

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

async function makeSandbox (): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'playwright-config-')))
  sandboxes.push(root)
  return root
}

describe('playwright-config', () => {
  it('it should load simple config correctly', async () => {
    const pwConfig = await Session.loadFile(path.join(fixturesPath, 'simple-config.ts'))
    const config = new PlaywrightConfig(path.join(fixturesPath, 'simple-config.ts'), pwConfig)
    expect(Array.from(config.testMatch)).toEqual(['**/*.@(spec|test).?(c|m)[jt]s?(x)'])
    expect(config.getBrowsers()).toEqual(['chromium', 'webkit', 'msedge', 'chrome'])
  })
  it('it should load simple config correctly', async () => {
    const pwConfig = await Session.loadFile(path.join(fixturesPath, 'simple-config-no-browsers.ts'))
    const config = new PlaywrightConfig(path.join(fixturesPath, 'simple-config-no-browsers.ts'), pwConfig)
    expect(Array.from(config.testMatch)).toEqual(['tests.*.ts'])
    expect(config.getBrowsers()).toEqual(['chromium'])
  })

  it('should resolve config paths through symlinks into one canonical namespace', async () => {
    // Everything the config names must end up in the same namespace: snapshot
    // patterns are built by mixing testDir, snapshotDir and discovered file
    // paths, and one path spelled through a link while another is resolved
    // produces `..`-laden glob patterns that match nothing.
    const root = await makeSandbox()
    await fs.mkdir(path.join(root, 'real', 'tests'), { recursive: true })
    await fs.writeFile(path.join(root, 'real', 'setup.ts'), 'export default async () => {}')
    await fs.symlink(path.join('real', 'tests'), path.join(root, 'linked-tests'))
    await fs.symlink(path.join('real', 'setup.ts'), path.join(root, 'linked-setup.ts'))

    const config = new PlaywrightConfig(path.join(root, 'playwright.config.ts'), {
      testDir: './linked-tests',
      globalSetup: './linked-setup.ts',
      projects: [{ name: 'proj', testDir: './linked-tests' }],
    })

    expect(config.testDir).toBe(path.join(root, 'real', 'tests'))
    expect(config.snapshotDir).toBe(path.join(root, 'real', 'tests'))
    expect(config.projects?.[0].testDir).toBe(path.join(root, 'real', 'tests'))
    expect(Array.from(config.files)).toEqual([path.join(root, 'real', 'setup.ts')])
  })

  it('should canonicalize a config file path reached through a symlink', async () => {
    // A config referenced through a link (playwrightConfigPath into a linked
    // package) must land in the same canonical namespace as its content, or it
    // gets archived beneath the very link the bundle carries for it — which
    // forces that link out of the archive.
    const root = await makeSandbox()
    await fs.mkdir(path.join(root, 'real-pkg'), { recursive: true })
    await fs.writeFile(path.join(root, 'real-pkg', 'playwright.config.ts'), 'export default {}')
    await fs.symlink('real-pkg', path.join(root, 'linked-pkg'))

    const spelled = path.join(root, 'linked-pkg', 'playwright.config.ts')
    const config = new PlaywrightConfig(spelled, {})

    expect(config.configFilePath).toBe(path.join(root, 'real-pkg', 'playwright.config.ts'))
    // The spelled location is recorded so the traversed link travels with the
    // bundle and the spelling still resolves on the runner.
    expect(config.referencedPaths.get(spelled)).toBe(config.configFilePath)
  })

  it('should keep nonexistent config paths as spelled', async () => {
    const root = await makeSandbox()

    const config = new PlaywrightConfig(path.join(root, 'playwright.config.ts'), {
      testDir: './non-existent',
    })

    // Nothing to resolve; downstream code handles the missing directory.
    expect(config.testDir).toBe(path.join(root, 'non-existent'))
  })
})
