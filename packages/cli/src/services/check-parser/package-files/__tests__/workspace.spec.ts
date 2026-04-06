import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { Workspace } from '../workspace'

describe('Workspace.resolvePatterns', () => {
  // Builds a temporary directory tree with both a workspace-style
  // `packages/*` layout and a populated `node_modules/`. We use this to
  // verify that wide workspace patterns never walk into `node_modules`
  // (matching npm/yarn's actual workspace resolution behavior).
  let root: string

  beforeAll(async () => {
    root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-workspace-spec-')),
    )

    // User package under the workspace.
    await fs.mkdir(path.join(root, 'packages', 'alpha'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'packages', 'alpha', 'package.json'),
      JSON.stringify({ name: '@ws/alpha', version: '1.0.0' }),
    )

    await fs.mkdir(path.join(root, 'packages', 'beta'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'packages', 'beta', 'package.json'),
      JSON.stringify({ name: '@ws/beta', version: '1.0.0' }),
    )

    // An installed npm package that lives inside node_modules — this
    // must never be picked up by workspace pattern resolution, no matter
    // how wide the glob.
    await fs.mkdir(path.join(root, 'node_modules', 'chokidar'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'node_modules', 'chokidar', 'package.json'),
      JSON.stringify({ name: 'chokidar', version: '3.6.0' }),
    )

    await fs.mkdir(path.join(root, 'node_modules', 'fsevents'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'node_modules', 'fsevents', 'package.json'),
      JSON.stringify({ name: 'fsevents', version: '2.3.3' }),
    )

    // Nested: a workspace package with its own node_modules — the inner
    // node_modules must also be ignored.
    await fs.mkdir(path.join(root, 'packages', 'alpha', 'node_modules', 'rimraf'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'packages', 'alpha', 'node_modules', 'rimraf', 'package.json'),
      JSON.stringify({ name: 'rimraf', version: '6.0.0' }),
    )
  })

  afterAll(async () => {
    if (root) {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('matches packages under a narrow pattern', async () => {
    const packages = await Workspace.resolvePatterns(root, ['packages/*'])
    const names = packages.map(p => p.name).sort()
    expect(names).toEqual(['@ws/alpha', '@ws/beta'])
  })

  it('ignores node_modules even with a wildcard pattern (issue #1274)', async () => {
    // This is the key regression test: a wide `**` pattern used to walk
    // into node_modules and turn every installed npm package into a
    // workspace neighbor, which made the parser try to bundle the
    // transitive closure (including native bindings like fsevents.node).
    const packages = await Workspace.resolvePatterns(root, ['**'])
    const names = packages.map(p => p.name).sort()

    expect(names).not.toContain('chokidar')
    expect(names).not.toContain('fsevents')
    expect(names).not.toContain('rimraf')
  })

  it('ignores top-level node_modules explicitly', async () => {
    const packages = await Workspace.resolvePatterns(root, ['node_modules/*'])
    expect(packages).toHaveLength(0)
  })

  it('ignores nested node_modules inside workspace packages', async () => {
    const packages = await Workspace.resolvePatterns(root, ['packages/*/node_modules/*'])
    expect(packages).toHaveLength(0)
  })
})
