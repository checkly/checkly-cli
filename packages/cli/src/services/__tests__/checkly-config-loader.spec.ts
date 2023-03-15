import * as path from 'path'
import { loadChecklyConfig } from '../checkly-config-loader'
import { pathToPosix, splitConfigFilePath } from '../util'

describe('loadChecklyConfig()', () => {
  it('config file should export an object', async () => {
    try {
      await loadChecklyConfig(path.join(__dirname, 'fixtures', 'configs'), ['no-export-config.js'])
    } catch (e: any) {
      expect(e.message).toContain('Config object missing a logicalId as type string')
    }
  })
  it('config file should export an object with projectName and logicalId', async () => {
    try {
      await loadChecklyConfig(path.join(__dirname, 'fixtures', 'configs'), ['no-logical-id-config.js'])
    } catch (e: any) {
      expect(e.message).toContain('Config object missing a logicalId as type string')
    }
  })
  it('error should indicate the tried file name combinations', async () => {
    const configDir = path.join(__dirname, 'fixtures', 'not-existing-config-path')
    try {
      await loadChecklyConfig(configDir)
    } catch (e: any) {
      expect(e.message).toContain(`Unable to locate a config at ${configDir} with ${['checkly.config.ts', 'checkly.config.js'].join(', ')}.`)
    }
  })
  it('config TS file should export an object', async () => {
    const configFile = './fixtures/configs/good-config.ts'
    const { configDirectory, configFilenames } = splitConfigFilePath(configFile)

    expect(configFilenames).toEqual(['good-config.ts'])
    expect(configDirectory).toEqual(pathToPosix(path.dirname(path.join(process.cwd(), configFile))))

    const {
      config,
    } = await loadChecklyConfig(path.join(__dirname, 'fixtures', 'configs'), ['good-config.ts'])

    expect(config).toMatchObject({
      checks: {
        checkMatch: '**/*.check.ts',
        browserChecks: {
          testMatch: '**/__checks__/*.spec.ts',
        },
      },
    })
  })
  it('config TS file should export an object', async () => {
    const configFile = './fixtures/configs/good-config.js'
    const { configDirectory, configFilenames } = splitConfigFilePath(configFile)

    expect(configFilenames).toEqual(['good-config.js'])
    expect(configDirectory).toEqual(pathToPosix(path.dirname(path.join(process.cwd(), configFile))))

    const {
      config,
    } = await loadChecklyConfig(path.join(__dirname, 'fixtures', 'configs'), ['good-config.js'])

    expect(config).toMatchObject({
      checks: {
        checkMatch: '**/*.check.ts',
        browserChecks: {
          testMatch: '**/__checks__/*.spec.ts',
        },
      },
    })
  })
})
