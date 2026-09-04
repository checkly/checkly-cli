import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectEngine } from '../engine-detector.js'
import { Engine } from '../../constructs/engine.js'

async function writeFiles (root: string, files: Record<string, string | object>): Promise<void> {
  for (const [relPath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relPath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const data = typeof contents === 'string' ? contents : JSON.stringify(contents)
    await fs.writeFile(filePath, data)
  }
}

describe('detectEngine', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'engine-detector-'))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('should still detect Node from .node-version', async () => {
    await writeFiles(root, { '.node-version': '24.1.0\n' })
    const result = await detectEngine(root)
    expect(result?.engine).toEqual(Engine.node('24'))
    expect(result?.notices).toEqual([])
  })

  it('should skip an engines.node value that is not a semver range', async () => {
    await writeFiles(root, { 'package.json': { engines: { node: 'lts', bun: 'latest' } } })
    expect(await detectEngine(root)).toBeUndefined()
  })

  it('should return undefined when no source is present', async () => {
    await writeFiles(root, { 'package.json': { name: 'x' } })
    expect(await detectEngine(root)).toBeUndefined()
  })

  describe('volta.node', () => {
    it('should detect Node from a volta pin', async () => {
      await writeFiles(root, { 'package.json': { volta: { node: '24.17.0', pnpm: '10.30.0' } } })
      const result = await detectEngine(root)
      expect(result?.engine).toEqual(Engine.node('24'))
      expect(result?.notices).toEqual([])
    })

    it('should let a version file win over the volta pin', async () => {
      await writeFiles(root, {
        '.nvmrc': '22\n',
        'package.json': { volta: { node: '24.17.0' } },
      })
      const result = await detectEngine(root)
      expect(result?.engine).toEqual(Engine.node('22'))
    })

    it('should let the volta pin win over engines.node', async () => {
      await writeFiles(root, {
        'package.json': { volta: { node: '24.17.0' }, engines: { node: '>=22' } },
      })
      const result = await detectEngine(root)
      expect(result?.engine).toEqual(Engine.node('24'))
    })

    it('should accept a semver range as the pin value', async () => {
      await writeFiles(root, { 'package.json': { volta: { node: '>=24' } } })
      const result = await detectEngine(root)
      expect(result?.engine).toEqual(Engine.node('24'))
    })

    it('should not affect Bun detection', async () => {
      await writeFiles(root, {
        '.bun-version': '1.3.0\n',
        'package.json': { volta: { node: '24.17.0' } },
      })
      const result = await detectEngine(root)
      expect(result?.engine).toEqual(Engine.node('24'))
    })

    it('should follow a volta.extends chain', async () => {
      await writeFiles(root, {
        'project/package.json': { volta: { extends: '../shared/volta.json' } },
        'shared/volta.json': { volta: { extends: './base.json' } },
        'shared/base.json': { volta: { node: '24.17.0' } },
      })
      const result = await detectEngine(path.join(root, 'project'))
      expect(result?.engine).toEqual(Engine.node('24'))
    })

    it('should prefer the manifest pin over the extended manifest', async () => {
      await writeFiles(root, {
        'package.json': { volta: { node: '22.0.0', extends: './base.json' } },
        'base.json': { volta: { node: '24.17.0' } },
      })
      const result = await detectEngine(root)
      expect(result?.engine).toEqual(Engine.node('22'))
    })

    it('should terminate a cyclic volta.extends chain and fall through to engines', async () => {
      await writeFiles(root, {
        'package.json': { volta: { extends: './package.json' }, engines: { node: '>=22' } },
      })
      const result = await detectEngine(root)
      expect(result?.engine).toEqual(Engine.node('22'))
    })

    it('should skip a missing extended manifest', async () => {
      await writeFiles(root, {
        'package.json': { volta: { extends: './missing.json' } },
      })
      expect(await detectEngine(root)).toBeUndefined()
    })

    it('should skip a pin that is not a semver version or range', async () => {
      await writeFiles(root, { 'package.json': { volta: { node: 'lts' }, engines: { node: '>=22' } } })
      const result = await detectEngine(root)
      expect(result?.engine).toEqual(Engine.node('22'))
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
        const result = await detectEngine(root, path.join(root, 'apps', 'x'))
        expect(result?.engine).toEqual(Engine.node('24'))
      })

      it('should find a pin in the nested context package', async () => {
        await writeFiles(root, {
          'package.json': { name: 'root' },
          'apps/x/package.json': { volta: { node: '24.17.0' } },
        })
        const contextPath = path.join(root, 'apps', 'x')
        expect((await detectEngine(root, contextPath))?.engine).toEqual(Engine.node('24'))
        expect(await detectEngine(root)).toBeUndefined()
      })

      it('should stop at the nearest manifest with a volta key even without a node pin', async () => {
        await writeFiles(root, {
          'package.json': { volta: { node: '24.17.0' } },
          'apps/x/package.json': { volta: { pnpm: '10.30.0' } },
        })
        const result = await detectEngine(root, path.join(root, 'apps', 'x'))
        expect(result).toBeUndefined()
      })

      it('should not walk outside the project root', async () => {
        const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'engine-detector-outside-'))
        try {
          await writeFiles(outside, { 'package.json': { volta: { node: '22.0.0' } } })
          await writeFiles(root, { 'package.json': { volta: { node: '24.17.0' } } })
          const result = await detectEngine(root, outside)
          expect(result?.engine).toEqual(Engine.node('24'))
        } finally {
          await fs.rm(outside, { recursive: true, force: true })
        }
      })
    })
  })
})
