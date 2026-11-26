import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadChecklyConfig } from '../../services/checkly-config-loader.js'
import { Ok } from '../../services/check-parser/package-files/result.js'
import { Diagnostics } from '../diagnostics.js'
import { Engine } from '../engine.js'
import { PlaywrightCheck, type PlaywrightCheckProps } from '../playwright-check.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

const ENGINE_MODULE = path.resolve(__dirname, '..', 'engine.ts')

describe('PlaywrightCheck engine', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'playwright-check-engine-')))
    await fs.writeFile(path.join(dir, 'playwright.config.mjs'), 'export default {}\n')
    Session.reset()
    Session.project = new Project('project', { name: 'Project' })
    Session.workspace = Ok({ lockfile: Ok(path.join(dir, 'package-lock.json')) } as any)
    Session.checkFilesDirectory = dir
  })

  afterEach(async () => {
    Session.reset()
    await fs.rm(dir, { recursive: true, force: true })
  })

  /** A check declared in `__checks__/suite.check.ts`, validated the way a command validates it. */
  async function validatedCheck (props: Partial<PlaywrightCheckProps> = {}) {
    Session.checkFileAbsolutePath = path.join(dir, '__checks__', 'suite.check.ts')
    let check: PlaywrightCheck
    try {
      check = new PlaywrightCheck('suite', {
        name: 'Suite',
        playwrightConfigPath: path.join(dir, 'playwright.config.mjs'),
        ...props,
      })
    } finally {
      Session.checkFileAbsolutePath = undefined
    }
    const diagnostics = new Diagnostics()
    await check.validate(diagnostics)
    const engineDiagnostics = diagnostics.observations.filter(o => o.message.includes('"engine"'))
    return { check, engineDiagnostics }
  }

  describe('Engine.node()', () => {
    it.each([
      ['an exact version', '24.11.0', '24.11.0'],
      ['an end-of-life major', '18', '18'],
      ['a range', '>=22', '>=22'],
      ['a value that is not a version', 'abc', 'abc'],
      ['a leading v and whitespace', ' v24.11.0 ', '24.11.0'],
    ])('sends %s as written, without a diagnostic', async (_, written, sent) => {
      const { check, engineDiagnostics } = await validatedCheck({ engine: Engine.node(written) })

      expect(check.synthesize()).toMatchObject({ engine: 'node', engineVersion: sent })
      expect(engineDiagnostics).toEqual([])
    })

    it('names the file that declares the check when the call site is not known', async () => {
      const { check } = await validatedCheck({ engine: Engine.node('^24.11.0') })

      expect(check.nodeVersionRequest()).toEqual({
        version: '^24.11.0',
        source: 'Engine.node() in __checks__/suite.check.ts',
      })
      // The source is the CLI's own: the payload carries the version only.
      expect(JSON.stringify(check.synthesize())).not.toContain('suite.check.ts')
    })

    it('names the file that calls Engine.node()', async () => {
      const shared = path.join(dir, 'shared', 'engine.mjs')
      await fs.mkdir(path.dirname(shared), { recursive: true })
      await fs.writeFile(shared, [
        `import { Engine } from ${JSON.stringify(pathToFileURL(ENGINE_MODULE).href)}`,
        `export const engine = Engine.node('^24.11.0')`,
        '',
      ].join('\n'))
      const { engine } = await import(pathToFileURL(shared).href)

      const { check } = await validatedCheck({ engine })

      expect(check.nodeVersionRequest()?.source).toBe('Engine.node() in shared/engine.mjs')
    })

    it('names the Checkly config file for an engine written there as a plain object', async () => {
      await fs.writeFile(path.join(dir, 'checkly.config.mjs'), `export default ${JSON.stringify({
        projectName: 'Project',
        logicalId: 'project',
        checks: {
          playwrightChecks: [{ logicalId: 'suite', name: 'Suite', engine: { name: 'node', version: '^24.11.0' } }],
        },
      })}\n`)
      const { config } = await loadChecklyConfig(dir, ['checkly.config.mjs'], false)
      const [{ engine }] = config.checks!.playwrightChecks!

      // Created the way the project parser creates a `playwrightChecks`
      // entry: attributed to the Playwright config file.
      const { check } = await validatedCheck({ engine })

      expect(check.nodeVersionRequest()).toEqual({
        version: '^24.11.0',
        source: 'Engine.node() in checkly.config.mjs',
      })
    })
  })

  describe('detection', () => {
    it('names the version file or field the version was read from', async () => {
      await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
        devEngines: { runtime: { name: 'node', version: 'v26.13.0' } },
      }))
      Session.basePath = dir
      Session.contextPath = dir

      const { check, engineDiagnostics } = await validatedCheck()

      expect(check.synthesize()).toMatchObject({ engine: 'node', engineVersion: '26.13.0' })
      expect(check.nodeVersionRequest()).toEqual({ version: '26.13.0', source: 'package.json devEngines.runtime' })
      expect(engineDiagnostics).toEqual([])
    })

    it('asks for no Node.js version without a source', async () => {
      Session.basePath = dir
      Session.contextPath = dir

      const { check } = await validatedCheck()

      expect(check.synthesize()).not.toHaveProperty('engineVersion')
      expect(check.nodeVersionRequest()).toBeUndefined()
    })
  })

  describe('Bun', () => {
    it('asks for no Node.js version', async () => {
      const { check } = await validatedCheck({ engine: Engine.bun('1.4.2') })

      expect(check.synthesize()).toMatchObject({ engine: 'bun', engineVersion: '1.4' })
      expect(check.nodeVersionRequest()).toBeUndefined()
    })

    it('still remaps an unavailable minor with a notice', async () => {
      const { check, engineDiagnostics } = await validatedCheck({ engine: Engine.bun('1.2') })

      expect(check.synthesize()).toMatchObject({ engine: 'bun', engineVersion: '1.3' })
      expect(engineDiagnostics).toHaveLength(1)
    })
  })
})
