import path from "node:path";
import { PlaywrightConfig } from "../playwright-config";
import { describe, it, expect } from 'vitest'
import { Session } from '../../constructs'


const fixturesPath = path.join(__dirname, 'fixtures', 'playwright-configs')

describe('playwright-config', () => {
  it('it should load simple config correctly', async () => {
    const pwConfig = await Session.loadFile(path.join(fixturesPath, 'simple-config.ts'))
    const config = new PlaywrightConfig(fixturesPath, pwConfig)
    expect(Array.from(config.testMatch)).toEqual(['**/*.@(spec|test).?(c|m)[jt]s?(x)'])
    expect(config.getBrowsers()).toEqual(['chromium', 'webkit', 'msedge', 'chrome'])
  })
  it('it should load simple config correctly', async () => {
    const pwConfig = await Session.loadFile(path.join(fixturesPath,'simple-config-no-browsers.ts'))
    const config = new PlaywrightConfig(fixturesPath, pwConfig)
    expect(Array.from(config.testMatch)).toEqual(['tests.*.ts'])
    expect(config.getBrowsers()).toEqual(['chromium'])
  })
})
