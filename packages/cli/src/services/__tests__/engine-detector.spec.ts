import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectEngine } from '../engine-detector.js'
import { Engine } from '../../constructs/engine.js'

async function writeFiles (root: string, files: Record<string, string | Record<string, unknown>>): Promise<void> {
  for (const [relPath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relPath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const data = typeof contents === 'string' ? contents : JSON.stringify(contents)
    await fs.writeFile(filePath, data)
  }
}

/** The Node.js version detection sends and the source it names, or undefined. */
async function detectedNode (root: string, contextPath?: string, labelBase?: string) {
  const result = await detectEngine(root, contextPath, labelBase)
  if (result?.engine?.name !== 'node') return undefined
  return { version: result.engine.version, source: result.nodeVersionSource }
}

describe('detectEngine', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'engine-detector-'))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('should return undefined when no source is present', async () => {
    await writeFiles(root, { 'package.json': { name: 'x' } })
    expect(await detectEngine(root)).toBeUndefined()
  })

  describe('Node.js sources', () => {
    it.each([
      ['package.json devEngines.runtime', { 'package.json': { devEngines: { runtime: { name: 'node', version: '^26.13.0' } } } }],
      ['package.json engines.runtime', { 'package.json': { engines: { runtime: { name: 'node', version: '^26.13.0' } } } }],
      ['.node-version', { '.node-version': '^26.13.0\n' }],
      ['.nvmrc', { '.nvmrc': '^26.13.0\n' }],
      ['.tool-versions', { '.tool-versions': 'nodejs ^26.13.0\n' }],
      ['package.json volta.node', { 'package.json': { volta: { node: '^26.13.0' } } }],
      ['package.json engines.node', { 'package.json': { engines: { node: '^26.13.0' } } }],
    ])('should detect %s and name it', async (source, files) => {
      await writeFiles(root, files)
      const result = await detectEngine(root)
      expect(result).toEqual({ engine: Engine.node('^26.13.0'), notices: [], nodeVersionSource: source })
    })

    it('should take the sources in order', async () => {
      const pkg: Record<string, any> = {
        devEngines: { runtime: { name: 'node', version: '22.0.0' } },
        engines: { runtime: { name: 'node', version: '22.0.1' }, node: '22.5.0' },
        volta: { node: '22.4.0' },
      }
      await writeFiles(root, { '.node-version': '22.1.0\n', '.nvmrc': '22.2.0\n', '.tool-versions': 'nodejs 22.3.0\n' })
      // Each step removes the source that won it, so the next one is up.
      const steps: Array<[string, string, () => unknown]> = [
        ['22.0.0', 'package.json devEngines.runtime', () => delete pkg.devEngines],
        ['22.0.1', 'package.json engines.runtime', () => delete pkg.engines.runtime],
        ['22.1.0', '.node-version', () => fs.rm(path.join(root, '.node-version'))],
        ['22.2.0', '.nvmrc', () => fs.rm(path.join(root, '.nvmrc'))],
        ['22.3.0', '.tool-versions', () => fs.rm(path.join(root, '.tool-versions'))],
        ['22.4.0', 'package.json volta.node', () => delete pkg.volta],
        ['22.5.0', 'package.json engines.node', () => delete pkg.engines.node],
      ]
      for (const [version, source, remove] of steps) {
        await writeFiles(root, { 'package.json': pkg })
        expect(await detectedNode(root)).toEqual({ version, source })
        await remove()
      }
      await writeFiles(root, { 'package.json': pkg })
      expect(await detectEngine(root)).toBeUndefined()
    })

    it.each([
      ['an exact version', '24.11.0', '24.11.0'],
      ['a major', '24', '24'],
      ['a range', '^24.11.0', '^24.11.0'],
      ['a range with spaces', '>=22 <25', '>=22 <25'],
      ['a leading v', 'v24.11.0', '24.11.0'],
      ['surrounding whitespace', '  v26\n', '26'],
      ['a value that is not a version', 'lts/iron', 'lts/iron'],
    ])('should send %s as written', async (_, written, sent) => {
      await writeFiles(root, { 'package.json': { devEngines: { runtime: { name: 'node', version: written } } } })
      expect((await detectedNode(root))?.version).toBe(sent)
    })

    it('should not reduce .tool-versions, a Volta pin or engines.node to a major', async () => {
      await writeFiles(root, { '.tool-versions': 'nodejs v24.11.1\n' })
      expect(await detectedNode(root)).toEqual({ version: '24.11.1', source: '.tool-versions' })

      await fs.rm(path.join(root, '.tool-versions'))
      await writeFiles(root, { 'package.json': { volta: { node: '24.17.0' }, engines: { node: '>=22.12.0' } } })
      expect(await detectedNode(root)).toEqual({ version: '24.17.0', source: 'package.json volta.node' })

      await writeFiles(root, { 'package.json': { engines: { node: '>=22.12.0' } } })
      expect(await detectedNode(root)).toEqual({ version: '>=22.12.0', source: 'package.json engines.node' })
    })

    it('should send an engines.node value that is not a version as written', async () => {
      await writeFiles(root, { 'package.json': { engines: { node: 'lts' } } })
      expect(await detectedNode(root)).toEqual({ version: 'lts', source: 'package.json engines.node' })
    })

    it('should skip a value that is not a string, or an empty one', async () => {
      await writeFiles(root, {
        'package.json': {
          devEngines: { runtime: { name: 'node', version: 26 } },
          engines: { runtime: { name: 'node', version: '  ' }, node: 22 },
          volta: { node: '' },
        },
        '.node-version': '\n',
        '.tool-versions': 'nodejs 24.11.0\n',
      })
      expect(await detectedNode(root)).toEqual({ version: '24.11.0', source: '.tool-versions' })
    })

    const aliases = ['lts/*', 'lts/iron', 'lts', 'node', 'stable', 'latest']
    it.each([
      ...aliases.map(alias => ['.node-version', alias, `${alias}\n`]),
      ...aliases.map(alias => ['.nvmrc', alias, `${alias}\n`]),
      ...aliases.map(alias => ['.tool-versions', alias, `nodejs ${alias}\n`]),
    ])('should fall through the %s alias %s to the next source', async (file, _, contents) => {
      await writeFiles(root, { [file]: contents, 'package.json': { engines: { node: '>=22' } } })
      expect(await detectedNode(root)).toEqual({ version: '>=22', source: 'package.json engines.node' })
    })

    it('should send a .node-version or .tool-versions value that is not an alias as written', async () => {
      await writeFiles(root, { '.node-version': 'iron\n', '.tool-versions': 'nodejs ref:v24.11.0\n' })
      expect(await detectedNode(root)).toEqual({ version: 'iron', source: '.node-version' })

      await fs.rm(path.join(root, '.node-version'))
      expect(await detectedNode(root)).toEqual({ version: 'ref:v24.11.0', source: '.tool-versions' })
    })

    it('should send a .nvmrc version without its leading v', async () => {
      await writeFiles(root, { '.nvmrc': 'v22.12.0\n' })
      expect(await detectedNode(root)).toEqual({ version: '22.12.0', source: '.nvmrc' })
    })

    it('should name each source relative to the config directory', async () => {
      const app = path.join(root, 'packages', 'app')
      await writeFiles(root, {
        'package.json': { devEngines: { runtime: { name: 'node', version: '^24.11.0' } } },
        '.node-version': '24.11.0\n',
        'packages/app/package.json': { name: 'app' },
      })
      expect(await detectedNode(root, app, app))
        .toEqual({ version: '^24.11.0', source: '../../package.json devEngines.runtime' })

      await writeFiles(root, { 'package.json': { name: 'root' } })
      expect(await detectedNode(root, app, app)).toEqual({ version: '24.11.0', source: '../../.node-version' })
    })

    it('should read the runtime fields from the project root package.json only', async () => {
      await writeFiles(root, {
        'package.json': { name: 'root' },
        'apps/x/package.json': { devEngines: { runtime: { name: 'node', version: '^24.11.0' } } },
      })
      expect(await detectEngine(root, path.join(root, 'apps', 'x'))).toBeUndefined()
    })
  })

  describe('devEngines.runtime and engines.runtime', () => {
    it('should take the first node entry of an array', async () => {
      await writeFiles(root, {
        'package.json': {
          devEngines: {
            runtime: [
              { name: 'bun', version: '1.3.0' },
              { name: 'node', version: '^24.11.0', onFail: 'download' },
              { name: 'node', version: '^26.13.0' },
            ],
          },
        },
      })
      expect(await detectedNode(root)).toEqual({ version: '^24.11.0', source: 'package.json devEngines.runtime' })
    })

    it('should take the first node entry with a string version', async () => {
      await writeFiles(root, {
        'package.json': { devEngines: { runtime: [{ name: 'node' }, { name: 'node', version: '^24' }] } },
      })
      expect(await detectedNode(root)).toEqual({ version: '^24', source: 'package.json devEngines.runtime' })
    })

    it('should take the entry whatever its onFail', async () => {
      await writeFiles(root, {
        'package.json': { engines: { runtime: { name: 'node', version: '^24.11.0', onFail: 'ignore' } } },
      })
      expect(await detectedNode(root)).toEqual({ version: '^24.11.0', source: 'package.json engines.runtime' })
    })

    it('should ignore an entry for another runtime', async () => {
      await writeFiles(root, {
        'package.json': {
          devEngines: { runtime: { name: 'deno', version: '^2.4.3' } },
          engines: { runtime: [{ name: 'bun', version: '1.4.0' }] },
        },
        '.node-version': '24.11.0\n',
      })
      expect(await detectedNode(root)).toEqual({ version: '24.11.0', source: '.node-version' })
    })

    it('should take engines.runtime when devEngines.runtime names no Node.js', async () => {
      await writeFiles(root, {
        'package.json': {
          devEngines: { runtime: [{ name: 'bun', version: '1.3.0' }] },
          engines: { runtime: [{ name: 'node', version: '>=22.12.0' }] },
        },
      })
      expect(await detectedNode(root)).toEqual({ version: '>=22.12.0', source: 'package.json engines.runtime' })
    })

    it('should not detect Bun from a bun runtime entry', async () => {
      await writeFiles(root, { 'package.json': { devEngines: { runtime: { name: 'bun', version: '1.4.0' } } } })
      expect(await detectEngine(root)).toBeUndefined()
    })
  })

  describe('Bun', () => {
    it('should detect Bun 1.4 from .bun-version', async () => {
      await writeFiles(root, { '.bun-version': '1.4.2\n' })
      expect(await detectEngine(root)).toEqual({ engine: Engine.bun('1.4'), notices: [] })
    })

    it('should map a not-yet-available Bun minor from .bun-version to 1.4', async () => {
      await writeFiles(root, { '.bun-version': '1.5.0\n' })
      const result = await detectEngine(root)
      expect(result?.engine).toEqual(Engine.bun('1.4'))
      expect(result?.notices).toEqual([expect.stringContaining('Bun 1.5')])
    })

    it('should deny Bun 2 with a notice', async () => {
      await writeFiles(root, { '.bun-version': '2.0.0\n' })
      const result = await detectEngine(root)
      expect(result?.engine).toBeUndefined()
      expect(result?.notices).toEqual([expect.stringContaining('Bun 2.0')])
    })

    it('should detect Bun from .tool-versions before .bun-version', async () => {
      await writeFiles(root, { '.tool-versions': 'bun 1.3.5\n', '.bun-version': '1.4.0\n' })
      expect((await detectEngine(root))?.engine).toEqual(Engine.bun('1.3'))
    })

    it('should detect Bun from the lowest version of an engines.bun range', async () => {
      await writeFiles(root, { 'package.json': { engines: { bun: '>=1.3.0' } } })
      expect((await detectEngine(root))?.engine).toEqual(Engine.bun('1.3'))
    })

    it('should skip an engines.bun value that is not a semver range', async () => {
      await writeFiles(root, { 'package.json': { engines: { bun: 'latest' } } })
      expect(await detectEngine(root)).toBeUndefined()
    })

    it('should let any Node.js source win over Bun', async () => {
      await writeFiles(root, {
        '.bun-version': '1.3.0\n',
        '.tool-versions': 'bun 1.4.0\nnodejs 24.11.0\n',
      })
      expect(await detectedNode(root)).toEqual({ version: '24.11.0', source: '.tool-versions' })
    })
  })

  describe('volta.node', () => {
    it('should let a version file win over the volta pin', async () => {
      await writeFiles(root, {
        '.nvmrc': '22\n',
        'package.json': { volta: { node: '24.17.0' } },
      })
      expect(await detectedNode(root)).toEqual({ version: '22', source: '.nvmrc' })
    })

    it('should let the volta pin win over engines.node', async () => {
      await writeFiles(root, {
        'package.json': { volta: { node: '24.17.0' }, engines: { node: '>=22' } },
      })
      expect(await detectedNode(root)).toEqual({ version: '24.17.0', source: 'package.json volta.node' })
    })

    it('should follow a volta.extends chain and name the file that holds the pin', async () => {
      await writeFiles(root, {
        'package.json': { volta: { extends: './shared/volta.json' } },
        'shared/volta.json': { volta: { extends: './base.json' } },
        'shared/base.json': { volta: { node: '24.17.0' } },
      })
      expect(await detectedNode(root)).toEqual({ version: '24.17.0', source: 'shared/base.json volta.node' })
    })

    it('should prefer the manifest pin over the extended manifest', async () => {
      await writeFiles(root, {
        'package.json': { volta: { node: '22.0.0', extends: './base.json' } },
        'base.json': { volta: { node: '24.17.0' } },
      })
      expect(await detectedNode(root)).toEqual({ version: '22.0.0', source: 'package.json volta.node' })
    })

    it('should terminate a cyclic volta.extends chain and fall through to engines', async () => {
      await writeFiles(root, {
        'package.json': { volta: { extends: './package.json' }, engines: { node: '>=22' } },
      })
      expect(await detectedNode(root)).toEqual({ version: '>=22', source: 'package.json engines.node' })
    })

    it('should skip a missing extended manifest', async () => {
      await writeFiles(root, {
        'package.json': { volta: { extends: './missing.json' } },
      })
      expect(await detectEngine(root)).toBeUndefined()
    })

    it('should send a pin that is not a version as written', async () => {
      await writeFiles(root, { 'package.json': { volta: { node: 'lts' }, engines: { node: '>=22' } } })
      expect(await detectedNode(root)).toEqual({ version: 'lts', source: 'package.json volta.node' })
    })

    it('should ignore non-string pin values', async () => {
      await writeFiles(root, { 'package.json': { volta: { node: 24 } } })
      expect(await detectEngine(root)).toBeUndefined()
    })

    describe('workspace lookup', () => {
      it('should find the workspace-root pin from a nested context path', async () => {
        await writeFiles(root, {
          'package.json': { volta: { node: '24.17.0' } },
          'apps/x/package.json': { name: 'x' },
        })
        expect(await detectedNode(root, path.join(root, 'apps', 'x')))
          .toEqual({ version: '24.17.0', source: 'package.json volta.node' })
      })

      it('should find a pin in the nested context package and name its manifest', async () => {
        await writeFiles(root, {
          'package.json': { name: 'root' },
          'packages/web/package.json': { volta: { node: '24.17.0' } },
        })
        expect(await detectedNode(root, path.join(root, 'packages', 'web')))
          .toEqual({ version: '24.17.0', source: 'packages/web/package.json volta.node' })
        expect(await detectEngine(root)).toBeUndefined()
      })

      it('should stop at the nearest manifest with a volta key even without a node pin', async () => {
        await writeFiles(root, {
          'package.json': { volta: { node: '24.17.0' } },
          'apps/x/package.json': { volta: { pnpm: '10.30.0' } },
        })
        expect(await detectEngine(root, path.join(root, 'apps', 'x'))).toBeUndefined()
      })

      it('should not walk outside the project root', async () => {
        const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'engine-detector-outside-'))
        try {
          await writeFiles(outside, { 'package.json': { volta: { node: '22.0.0' } } })
          await writeFiles(root, { 'package.json': { volta: { node: '24.17.0' } } })
          expect(await detectedNode(root, outside)).toEqual({ version: '24.17.0', source: 'package.json volta.node' })
        } finally {
          await fs.rm(outside, { recursive: true, force: true })
        }
      })
    })
  })
})
