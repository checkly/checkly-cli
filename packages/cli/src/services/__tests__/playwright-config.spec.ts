import path from "node:path";
import { loadFile } from "../util";
import { PlaywrightConfig } from "../playwright-config";

const loadConfig = (filename: string) => {
  return loadFile(path.join(__dirname, 'fixtures', 'playwright-configs', filename))
}

describe('playwright-config', () => {
  it('it should load simple config correctly', async () => {
    const pwConfig = await loadConfig('simple-config.ts')
    const config = new PlaywrightConfig(pwConfig)
    expect(config.getFiles()).toEqual(['./tests'])
    expect(config.getBrowsers()).toEqual(['chromium', 'webkit', 'msedge', 'chrome'])
  })
  it('it should load simple config correctly', async () => {
    const pwConfig = await loadConfig('simple-config-no-browsers.ts')
    const config = new PlaywrightConfig(pwConfig)
    expect(config.getFiles()).toEqual(['./tests', 'tests.*.ts'])
    expect(config.getBrowsers()).toEqual(['chromium'])
  })
})
