import path from 'node:path'
import fs from 'node:fs'

import config from 'config'
import { describe, it, expect, afterEach } from 'vitest'

import { runChecklyCli } from '../run-checkly'
import { loadChecklyConfig } from '../../src/services/checkly-config-loader'

describe('pw-test', { timeout: 45000 }, () => {
  afterEach(async() => {
    const configPath = path.join(__dirname, 'fixtures', 'test-pwt-native')
    fs.copyFileSync(path.join(configPath, 'checkly.config.original.ts'), path.join(configPath, 'checkly.config.ts'))
  })

  it('Playwright test should run successfully', async () => {
    const result = await runChecklyCli({
      args: ['pw-test', '--', `--grep`, '@TAG-B'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-pwt-native'),
      timeout: 120000, // 2 minutes
    })
    expect(result.status).toBe(0)
  }, 130000)

  it('Should add a Playwright test to the config', async () => {
    const result = await runChecklyCli({
      args: ['pw-test', '--create-check', '--', `--grep`, '@TAG-B'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: path.join(__dirname, 'fixtures', 'test-pwt-native'),
      timeout: 120000, // 2 minutes
    })
    expect(result.status).toBe(0)
    const checklyConfig = await loadChecklyConfig(path.join(__dirname, 'fixtures', 'test-pwt-native'))
    expect(checklyConfig.config?.checks).toBeDefined()
    expect(checklyConfig.config?.checks?.playwrightConfigPath).toBe('./playwright.config.ts')
    expect(checklyConfig.config?.checks?.playwrightChecks).toBeDefined()
    expect(checklyConfig.config?.checks?.playwrightChecks.length).toBe(1)
    expect(checklyConfig.config?.checks?.playwrightChecks[0].name).toBe('Playwright Test: --grep @TAG-B')
    expect(checklyConfig.config?.checks?.playwrightChecks[0].testCommand).toBe('npx playwright test --grep @TAG-B')
  })
})
