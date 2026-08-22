import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, afterAll } from 'vitest'

import { isPnpmfilePath, loadWorkspacePnpmfiles } from '../pnpmfile.js'

describe('pnpmfile', () => {
  const tempDirs: string[] = []

  afterAll(async () => {
    await Promise.all(tempDirs.map(dir => fs.rm(dir, { recursive: true, force: true, maxRetries: 3 })))
  })

  const makeRoot = async (files: Record<string, string>): Promise<string> => {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pnpmfile-')))
    tempDirs.push(dir)
    for (const [name, contents] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, name), contents)
    }
    return dir
  }

  describe('isPnpmfilePath()', () => {
    it('matches the default pnpmfile filenames at any location', () => {
      expect(isPnpmfilePath('/ws/.pnpmfile.cjs')).toBe(true)
      expect(isPnpmfilePath('/ws/.pnpmfile.mjs')).toBe(true)
      expect(isPnpmfilePath('/ws/packages/a/.pnpmfile.cjs')).toBe(true)
      expect(isPnpmfilePath('/ws/pnpmfile.cjs')).toBe(false)
      expect(isPnpmfilePath('/ws/index.cjs')).toBe(false)
    })
  })

  describe('loadWorkspacePnpmfiles()', () => {
    it('returns nothing when no pnpmfile exists', async () => {
      const root = await makeRoot({})
      expect(await loadWorkspacePnpmfiles(root)).toEqual([])
    })

    it('marks a self-contained pnpmfile as bundleable', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': 'module.exports = { hooks: { readPackage: pkg => pkg } }\n',
      })
      expect(await loadWorkspacePnpmfiles(root)).toEqual([
        { path: path.join(root, '.pnpmfile.cjs') },
      ])
    })

    it('allows safe Node.js builtin imports', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': [
          `const path = require('path')`,
          `const url = require('node:url')`,
          `module.exports = { hooks: {} }`,
        ].join('\n'),
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toBeUndefined()
    })

    it('rejects a pnpmfile that requires an npm package', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': `const semver = require('semver')\nmodule.exports = {}\n`,
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toContain('semver')
    })

    it('rejects a pnpmfile that requires a local file', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': `const helper = require('./tools/helper.cjs')\nmodule.exports = {}\n`,
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toBeDefined()
    })

    it('rejects a pnpmfile that loads unsafe builtins like fs', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': `const fs = require('node:fs')\nmodule.exports = {}\n`,
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toContain('node:fs')
    })

    it('rejects a pnpmfile that uses createRequire via node:module', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': `const { createRequire } = require('node:module')\n`
          + `const load = createRequire(__filename)\nmodule.exports = {}\n`,
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toBeDefined()
    })

    it('rejects a pnpmfile that uses require.resolve', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': `require.resolve('some-pkg')\nmodule.exports = {}\n`,
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toContain('require')
    })

    it('rejects a pnpmfile that reaches process via globalThis or global', async () => {
      const globalThisRoot = await makeRoot({
        '.pnpmfile.cjs': `const mirror = globalThis.process.env.NPM_MIRROR\nmodule.exports = {}\n`,
      })
      expect((await loadWorkspacePnpmfiles(globalThisRoot))[0].skipReason).toContain('globalThis')

      const globalRoot = await makeRoot({
        '.pnpmfile.cjs': `const ci = global.process.env.CI\nmodule.exports = {}\n`,
      })
      expect((await loadWorkspacePnpmfiles(globalRoot))[0].skipReason).toContain('global')
    })

    it('rejects a pnpmfile that uses module.require', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': `const semver = module.require('semver')\nmodule.exports = {}\n`,
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toContain('module')
    })

    it('allows plain module.exports', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': `module.exports = { hooks: {} }\nmodule.exports.extra = 1\n`,
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toBeUndefined()
    })

    it('rejects a pnpmfile that references __dirname or process', async () => {
      const dirnameRoot = await makeRoot({
        '.pnpmfile.cjs': `const p = __dirname + '/x.json'\nmodule.exports = {}\n`,
      })
      expect((await loadWorkspacePnpmfiles(dirnameRoot))[0].skipReason).toContain('__dirname')

      const processRoot = await makeRoot({
        '.pnpmfile.cjs': `const mirror = process.env.NPM_MIRROR\nmodule.exports = {}\n`,
      })
      expect((await loadWorkspacePnpmfiles(processRoot))[0].skipReason).toContain('process')
    })

    it('does not treat property names as hazardous references', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': `const obj = { process: 1 }\nconst x = obj.process\nmodule.exports = {}\n`,
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toBeUndefined()
    })

    it('rejects a pnpmfile with a dynamic require target', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': 'const hooks = require(`./hooks/${1}.cjs`)\nmodule.exports = {}\n',
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toBeDefined()
    })

    it('rejects an unparseable pnpmfile', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': 'module.exports = {',
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toContain('parse')
    })

    it('handles an ESM .pnpmfile.mjs', async () => {
      const root = await makeRoot({
        '.pnpmfile.mjs': `import path from 'node:path'\nexport const hooks = {}\n`,
      })
      expect(await loadWorkspacePnpmfiles(root)).toEqual([
        { path: path.join(root, '.pnpmfile.mjs') },
      ])
    })

    it('rejects an ESM pnpmfile that references import.meta', async () => {
      const root = await makeRoot({
        '.pnpmfile.mjs': `const dir = import.meta.dirname\nexport const hooks = {}\n`,
      })
      const [info] = await loadWorkspacePnpmfiles(root)
      expect(info.skipReason).toContain('import.meta')
    })

    it('skips both files when both default filenames exist', async () => {
      const root = await makeRoot({
        '.pnpmfile.cjs': 'module.exports = {}\n',
        '.pnpmfile.mjs': 'export const hooks = {}\n',
      })
      const infos = await loadWorkspacePnpmfiles(root)
      expect(infos).toHaveLength(2)
      for (const info of infos) {
        expect(info.skipReason).toContain('depends on the pnpm version')
      }
    })

    it('reports a custom pnpmfile path as non-bundleable and ignores default files', async () => {
      const root = await makeRoot({
        '.npmrc': 'pnpmfile=./tools/hooks.cjs\n',
        '.pnpmfile.cjs': 'module.exports = {}\n',
      })
      const infos = await loadWorkspacePnpmfiles(root)
      expect(infos).toHaveLength(1)
      expect(infos[0].path).toEqual(path.join(root, 'tools/hooks.cjs'))
      expect(infos[0].skipReason).toContain('custom path')
    })

    it('treats a pnpmfile setting naming the default file like the default', async () => {
      const root = await makeRoot({
        '.npmrc': 'pnpmfile=.pnpmfile.cjs\n',
        '.pnpmfile.cjs': 'module.exports = {}\n',
      })
      expect(await loadWorkspacePnpmfiles(root)).toEqual([
        { path: path.join(root, '.pnpmfile.cjs') },
      ])
    })

    it('detects the pnpmfile setting in pnpm-workspace.yaml', async () => {
      const root = await makeRoot({
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\npnpmfile: ./tools/hooks.cjs\n',
        '.pnpmfile.cjs': 'module.exports = {}\n',
      })
      const configFilePath = path.join(root, 'pnpm-workspace.yaml')
      const infos = await loadWorkspacePnpmfiles(root, configFilePath)
      expect(infos).toHaveLength(1)
      expect(infos[0].path).toEqual(path.join(root, 'tools/hooks.cjs'))
      expect(infos[0].skipReason).toContain('custom path')
    })

    it('reports each entry of an array-valued pnpmfile setting separately', async () => {
      const root = await makeRoot({
        'pnpm-workspace.yaml': 'pnpmfile:\n  - ./tools/a.cjs\n  - ./tools/b.cjs\n',
      })
      const configFilePath = path.join(root, 'pnpm-workspace.yaml')
      const infos = await loadWorkspacePnpmfiles(root, configFilePath)
      expect(infos.map(info => info.path)).toEqual([
        path.join(root, 'tools/a.cjs'),
        path.join(root, 'tools/b.cjs'),
      ])
      for (const info of infos) {
        expect(info.skipReason).toContain('custom path')
      }
    })

    it('reports inspection errors as a skip reason naming the failing file', async () => {
      const root = await makeRoot({})
      // A directory where a pnpmfile is expected produces a read error that
      // is not ENOENT.
      await fs.mkdir(path.join(root, '.pnpmfile.cjs'))
      const infos = await loadWorkspacePnpmfiles(root)
      expect(infos).toHaveLength(1)
      expect(infos[0].path).toEqual(path.join(root, '.pnpmfile.cjs'))
      expect(infos[0].skipReason).toContain(`failed to inspect '.pnpmfile.cjs'`)
    })

    it('bundles nothing when ignore-pnpmfile is set in .npmrc', async () => {
      const root = await makeRoot({
        '.npmrc': 'ignore-pnpmfile=true\n',
        '.pnpmfile.cjs': 'module.exports = {}\n',
      })
      expect(await loadWorkspacePnpmfiles(root)).toEqual([])
    })

    it('bundles nothing when ignorePnpmfile is set in pnpm-workspace.yaml', async () => {
      const root = await makeRoot({
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\nignorePnpmfile: true\n',
        '.pnpmfile.cjs': 'module.exports = {}\n',
      })
      const configFilePath = path.join(root, 'pnpm-workspace.yaml')
      expect(await loadWorkspacePnpmfiles(root, configFilePath)).toEqual([])
    })
  })
})
