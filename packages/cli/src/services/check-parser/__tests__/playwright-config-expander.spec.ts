import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { PlaywrightConfig } from '../../playwright-config.js'
import { PlaywrightConfigExpander } from '../playwright-config-expander.js'

const sandboxes: string[] = []

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

async function makeSandbox (): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'pw-expander-')))
  sandboxes.push(root)
  return root
}

describe('PlaywrightConfigExpander', () => {
  it('should discover test files through a symlinked testDir', async () => {
    const outer = await makeSandbox()
    const root = path.join(outer, 'proj')
    await fs.mkdir(path.join(root, 'real', 'tests'), { recursive: true })
    await fs.writeFile(path.join(root, 'real', 'tests', 'a.spec.ts'), 'test')
    await fs.symlink(path.join('real', 'tests'), path.join(root, 'linked-tests'))

    const config = new PlaywrightConfig(path.join(root, 'playwright.config.ts'), {
      testDir: './linked-tests',
    })

    const files = await new PlaywrightConfigExpander().findTestFiles(config, { bundleRoot: root })

    // Globbing with a symlinked working directory finds nothing, so without
    // canonicalization this discovers zero test files. (The config file itself
    // is always part of the result.)
    expect(files.sort()).toEqual([
      path.join(root, 'playwright.config.ts'),
      path.join(root, 'real', 'tests', 'a.spec.ts'),
    ])
  })

  it('should spell discovered paths in the bundle root namespace when the root is reached through a link', async () => {
    const outer = await makeSandbox()
    await fs.mkdir(path.join(outer, 'real-proj', 'tests'), { recursive: true })
    await fs.writeFile(path.join(outer, 'real-proj', 'tests', 'a.spec.ts'), 'test')
    await fs.symlink('real-proj', path.join(outer, 'alias-proj'))
    const lexicalRoot = path.join(outer, 'alias-proj')

    const config = new PlaywrightConfig(path.join(lexicalRoot, 'playwright.config.ts'), {
      testDir: './tests',
    })

    const files = await new PlaywrightConfigExpander().findTestFiles(config, { bundleRoot: lexicalRoot })

    // Discovery works in the canonical namespace, but everything downstream
    // measures paths against the root as the caller spelled it — a canonical
    // path against a differently-spelled root would escape it and produce
    // `..`-prefixed archive names.
    expect(files.sort()).toEqual([
      path.join(lexicalRoot, 'playwright.config.ts'),
      path.join(lexicalRoot, 'tests', 'a.spec.ts'),
    ])
  })

  it('should bundle at the spelling when a link points outside the bundle root', async () => {
    // Canonicalization stops at the bundle's edge: the spelled tree extracts as
    // ordinary directories, which is exactly what such projects relied on
    // before, and there is no in-root canonical location to prefer.
    const outer = await makeSandbox()
    const root = path.join(outer, 'proj')
    await fs.mkdir(root, { recursive: true })
    await fs.mkdir(path.join(outer, 'outside', 'tests'), { recursive: true })
    await fs.writeFile(path.join(outer, 'outside', 'tests', 'a.spec.ts'), 'test')
    await fs.symlink(path.join('..', 'outside'), path.join(root, 'linked'))

    const config = new PlaywrightConfig(path.join(root, 'playwright.config.ts'), {
      testDir: './linked/tests',
    })

    const files = await new PlaywrightConfigExpander().findTestFiles(config, { bundleRoot: root })

    expect(files).toEqual(expect.arrayContaining([
      path.join(root, 'linked', 'tests', 'a.spec.ts'),
    ]))
  })

  it('should re-express a file under the most specific out-of-root spelling', async () => {
    // Two config references whose out-of-root canonical targets nest: the
    // setup file lives under BOTH canonical prefixes, and must come back under
    // the spelling of the more specific one, or its config reference breaks.
    const outer = await makeSandbox()
    const root = path.join(outer, 'proj')
    await fs.mkdir(root, { recursive: true })
    await fs.mkdir(path.join(outer, 'shared', 'setup'), { recursive: true })
    await fs.writeFile(path.join(outer, 'shared', 'tests.spec.ts'), 'test')
    await fs.writeFile(path.join(outer, 'shared', 'setup', 'global.ts'), 'export default async () => {}')
    await fs.symlink(path.join('..', 'shared'), path.join(root, 'linked'))
    await fs.symlink(path.join('..', 'shared', 'setup'), path.join(root, 'linked-setup'))

    const config = new PlaywrightConfig(path.join(root, 'playwright.config.ts'), {
      testDir: './linked',
      globalSetup: './linked-setup/global.ts',
    })

    const files = await new PlaywrightConfigExpander().findTestFiles(config, { bundleRoot: root })

    expect(files).toEqual(expect.arrayContaining([
      path.join(root, 'linked', 'tests.spec.ts'),
      path.join(root, 'linked-setup', 'global.ts'),
    ]))
    expect(files).not.toContain(path.join(root, 'linked', 'setup', 'global.ts'))
  })

  it('should error on a discovered file outside the bundle root under every spelling', async () => {
    const outer = await makeSandbox()
    const root = path.join(outer, 'proj')
    await fs.mkdir(root, { recursive: true })
    await fs.mkdir(path.join(outer, 'shared-tests'), { recursive: true })
    await fs.writeFile(path.join(outer, 'shared-tests', 'a.spec.ts'), 'test')

    // No symlink involved: the config plainly names a directory outside the
    // root. Such files cannot be represented in the bundle; previously they
    // were archived at `..`-escaping names that never extracted.
    const config = new PlaywrightConfig(path.join(root, 'playwright.config.ts'), {
      testDir: '../shared-tests',
    })

    await expect(new PlaywrightConfigExpander().findTestFiles(config, { bundleRoot: root }))
      .rejects.toThrow(/outside the project's bundle root/)
  })

  it('should pass discovered paths through when no bundle root is given', async () => {
    const outer = await makeSandbox()
    const root = path.join(outer, 'proj')
    await fs.mkdir(root, { recursive: true })
    await fs.mkdir(path.join(outer, 'outside', 'tests'), { recursive: true })
    await fs.writeFile(path.join(outer, 'outside', 'tests', 'a.spec.ts'), 'test')
    await fs.symlink(path.join('..', 'outside', 'tests'), path.join(root, 'linked-tests'))

    const config = new PlaywrightConfig(path.join(root, 'playwright.config.ts'), {
      testDir: './linked-tests',
    })

    // The standalone config debugging command has no bundle root; it inspects
    // rather than bundles, and must not reject configs the bundler would.
    const files = await new PlaywrightConfigExpander().findTestFiles(config)

    expect(files.sort()).toEqual([
      path.join(outer, 'outside', 'tests', 'a.spec.ts'),
      path.join(root, 'playwright.config.ts'),
    ])
  })
})
