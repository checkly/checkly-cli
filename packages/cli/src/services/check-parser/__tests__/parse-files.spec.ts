import { Parser } from '../parser'
import * as path from 'path'
import { pathToPosix, loadFile } from '../../util'
import { PlaywrightConfig } from "../../playwright-config"

const fixturePath = path.join(__dirname, 'check-parser-fixtures')


describe('project parser - getFilesAndDependencies()', () => {
  it('should handle spec file', async () => {
    const projectPath = path.join(fixturePath, 'playwright-project')
    const playwrightConfig = new PlaywrightConfig(projectPath, await loadFile(path.join(projectPath, 'playwright.config.ts')))
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies(playwrightConfig)
    expect(res.files).toHaveLength(1)
    expect(res.errors).toHaveLength(0)
  })
  it('should handle a spec file with snapshots', async () => {
    const projectPath = path.join(fixturePath, 'playwright-project-snapshots')
    const playwrightConfig = new PlaywrightConfig(projectPath, await loadFile(path.join(projectPath, 'playwright.config.ts')))
    const parser = new Parser({})
    const res = await parser.getFilesAndDependencies(playwrightConfig)
    expect(res.files).toHaveLength(2)
    expect(res.errors).toHaveLength(0)
  })
})
