import { runChecklyCli } from '../run-checkly'
import * as path from 'path'
import { loadChecklyConfig } from '../../src/services/checkly-config-loader'
import * as fs from 'fs'

describe('sync-playwright', () => {
  // Since we are modifying the file let's keep it clean after each test
  afterEach(() => {
    const configPath = path.join(__dirname, 'fixtures', 'test-playwright-project')
    fs.copyFileSync(path.join(configPath, 'checkly.config.original.ts'), path.join(configPath, 'checkly.config.ts'))
  })

  it('should copy playwright config into checkly config', async () => {
    const { status, stdout } = await runChecklyCli({
      args: ['sync-playwright'],
      directory: path.join(__dirname, 'fixtures', 'test-playwright-project'),
    })
    expect(status).toBe(0)
    expect(stdout).toContain('Successfully updated Checkly config file')
    const checklyConfig = await loadChecklyConfig(path.join(__dirname, 'fixtures', 'test-playwright-project'))
    expect(checklyConfig.config?.checks?.playwrightConfig).toBeDefined()
    expect(checklyConfig.config?.checks?.playwrightConfig?.timeout).toEqual(1234)
    expect(checklyConfig.config?.checks?.playwrightConfig?.use).toBeDefined()
    expect(checklyConfig.config?.checks?.playwrightConfig?.use?.baseURL).toEqual('http://127.0.0.1:3000')
    expect(checklyConfig.config?.checks?.playwrightConfig?.expect).toBeDefined()
  })

  it('should fail if no playwright config file exists', async () => {
    const { status, stdout } = await runChecklyCli({
      args: ['sync-playwright'],
      directory: path.join(__dirname, 'fixtures', 'test-project'),
    })
    expect(status).toBe(1)
    expect(stdout).toContain('Could not find any playwright.config file.')
  })
})
