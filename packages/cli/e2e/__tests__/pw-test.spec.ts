import path from 'node:path'
import fs from 'node:fs'

import config from 'config'
import { describe, it, expect, afterEach, beforeAll } from 'vitest'

import { runChecklyCli } from '../run-checkly'
import { loadChecklyConfig } from '../../src/services/checkly-config-loader'

const FIXTURE_TEST_PWT_NATIVE = path.join(__dirname, 'fixtures', 'test-pwt-native')

describe('pw-test', { timeout: 45000 }, () => {
  afterEach(() => {
    fs.copyFileSync(
      path.join(FIXTURE_TEST_PWT_NATIVE, 'checkly.config.original.ts'),
      path.join(FIXTURE_TEST_PWT_NATIVE, 'checkly.config.ts'),
    )
  })

  beforeAll(async () => {
    // Install fixture dependencies or they will not resolve correctly.
    const { execa } = await import('execa')
    await execa('npm', ['install'], { cwd: FIXTURE_TEST_PWT_NATIVE })
  })

  it('Playwright test should run successfully', async () => {
    const result = await runChecklyCli({
      args: ['pw-test', '--', `--grep`, '@TAG-B'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: FIXTURE_TEST_PWT_NATIVE,
      timeout: 120000, // 2 minutes
    })
    if (result.status !== 0) {
      // eslint-disable-next-line no-console
      console.log(result)
    }
    expect(result.status).toBe(0)
  }, 130000)

  it('Should add a Playwright test to the config', async () => {
    const result = await runChecklyCli({
      args: ['pw-test', '--create-check', '--', `--grep`, '@TAG-B'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: FIXTURE_TEST_PWT_NATIVE,
      timeout: 120000, // 2 minutes
    })
    expect(result.status).toBe(0)
    const checklyConfig = await loadChecklyConfig(FIXTURE_TEST_PWT_NATIVE)
    expect(checklyConfig.config?.checks).toBeDefined()
    expect(checklyConfig.config?.checks?.playwrightConfigPath).toBe('./playwright.config.ts')
    expect(checklyConfig.config?.checks?.playwrightChecks).toBeDefined()
    const playwrightChecks = checklyConfig.config?.checks?.playwrightChecks
    expect(playwrightChecks).toBeDefined()
    expect(playwrightChecks!.length).toBe(1)
    expect(playwrightChecks![0].name).toBe('Playwright Test: --grep @TAG-B')
    expect(playwrightChecks![0].testCommand).toBe('npx playwright test --grep @TAG-B')
  })

  it('Should add a Playwright test with custom install command to the config', async () => {
    const result = await runChecklyCli({
      args: ['pw-test', '--install-command', 'pnpm install', '--create-check', '--', `--grep`, '@TAG-B'],
      apiKey: config.get('apiKey'),
      accountId: config.get('accountId'),
      directory: FIXTURE_TEST_PWT_NATIVE,
      timeout: 120000, // 2 minutes
    })
    expect(result.status).toBe(0)
    const checklyConfig = await loadChecklyConfig(FIXTURE_TEST_PWT_NATIVE)
    expect(checklyConfig.config?.checks).toBeDefined()
    expect(checklyConfig.config?.checks?.playwrightChecks).toBeDefined()
    const playwrightChecks = checklyConfig.config?.checks?.playwrightChecks
    expect(playwrightChecks).toBeDefined()
    expect(playwrightChecks!.length).toBe(1)
    expect(playwrightChecks![0].installCommand).toBe('pnpm install')
  })
})
