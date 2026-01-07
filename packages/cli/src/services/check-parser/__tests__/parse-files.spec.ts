import path from 'node:path'

import { describe, it, expect } from 'vitest'

import { Parser } from '../parser'
import { PlaywrightConfig } from '../../playwright-config'
import { Session } from '../../../constructs'
import { usingIsolatedFixture } from './helper'

const fixturePath = path.join(__dirname, 'check-parser-fixtures')

describe('project parser - getFilesAndDependencies()', () => {
  it('should handle spec file', async () => {
    await usingIsolatedFixture(fixturePath, async dir => {
      const projectPath = path.join(dir, 'playwright-project')

      const playwrightConfig = new PlaywrightConfig(
        path.join(projectPath, 'playwright.config.ts'),
        await Session.loadFile(path.join(projectPath, 'playwright.config.ts')),
      )
      const parser = new Parser({})
      const res = await parser.getFilesAndDependencies(playwrightConfig)
      expect(res.files).toHaveLength(2)
      expect(res.errors).toHaveLength(0)
    })
  })
  it('should handle a spec file with snapshots', async () => {
    await usingIsolatedFixture(fixturePath, async dir => {
      const projectPath = path.join(dir, 'playwright-project-snapshots')
      const playwrightConfig = new PlaywrightConfig(
        path.join(projectPath, 'playwright.config.ts'),
        await Session.loadFile(path.join(projectPath, 'playwright.config.ts')),
      )
      const parser = new Parser({})
      const res = await parser.getFilesAndDependencies(playwrightConfig)
      expect(res.files).toHaveLength(3)
      expect(res.errors).toHaveLength(0)
    })
  })
})
