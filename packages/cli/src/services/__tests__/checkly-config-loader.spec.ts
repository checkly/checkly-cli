import * as path from 'path'
import { loadChecklyConfig } from '../checkly-config-loader'
import { pathToPosix } from '../util'

describe('loadChecklyConfig()', () => {
  beforeEach(() => {
    process.chdir(__dirname)
  })
  it('default config file should export an object', async () => {
    const cwd = path.join(__dirname, 'fixtures/configs')
    // change working directory to access checkly.config.ts from the cwd
    process.chdir(cwd)
    const {
      config,
      projectCwd,
    } = await loadChecklyConfig()
    expect(config).toMatchObject({
      checks: {
        checkMatch: '**/*.check.ts',
        browserChecks: {
          testMatch: '**/__checks__/*.spec.ts',
        },
      },
    })
    expect(projectCwd).toEqual(pathToPosix(process.cwd()))
  })
  it('config TS file should export an object', async () => {
    const configFile = './fixtures/configs/good-config.ts'
    const {
      config,
      projectCwd,
    } = await loadChecklyConfig(configFile)
    expect(config).toMatchObject({
      checks: {
        checkMatch: '**/*.check.ts',
        browserChecks: {
          testMatch: '**/__checks__/*.spec.ts',
        },
      },
    })
    expect(projectCwd).toEqual(pathToPosix(path.dirname(path.join(process.cwd(), configFile))))
  })
  it('config JS file should export an object', async () => {
    const configFile = './fixtures/configs/good-config.js'
    const {
      config,
      projectCwd,
    } = await loadChecklyConfig(configFile)
    expect(config).toMatchObject({
      checks: {
        checkMatch: '**/*.check.ts',
        browserChecks: {
          testMatch: '**/__checks__/*.spec.ts',
        },
      },
    })
    expect(projectCwd).toEqual(pathToPosix(path.dirname(path.join(process.cwd(), configFile))))
  })
  it('config file should export an object with projectName and logicalId', async () => {
    try {
      await loadChecklyConfig('./fixtures/configs/no-logical-id-config.js')
    } catch (e: any) {
      expect(e.message).toContain('Config object missing a logicalId as type string')
    }
  })
  it('error should indicate the tried file name combinations', async () => {
    const configFile = './fixtures/not-existing-config-path'
    try {
      await loadChecklyConfig('./fixtures/not-existing-config-path')
    } catch (e: any) {
      expect(e.message).toContain(`Unable to locate a files [${path.basename(configFile)}]`)
    }
  })
})
