import path from 'node:path'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { loadChecklyConfig } from '../../src/services/checkly-config-loader'
import { FixtureSandbox } from '../../src/testing/fixture-sandbox'

async function runTest (fixt: FixtureSandbox, args: string[]) {
  const result = await fixt.run('npx', [
    'checkly',
    'pw-test',
    ...args,
  ], {
    timeout: 180_000,
  })

  if (result.exitCode !== 0) {
    // eslint-disable-next-line no-console
    console.error('stderr', result.stderr)
    // eslint-disable-next-line no-console
    console.error('stdout', result.stdout)
  }

  expect(result.exitCode).toBe(0)

  return result
}

describe('pw-test', { timeout: 45000 }, () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      source: path.join(__dirname, 'fixtures', 'test-pwt-native'),
    })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('Playwright test should run successfully', async () => {
    await runTest(fixt, [
      '--',
      '--grep',
      '@TAG-B',
    ])
  }, 130000)

  it('Should add a Playwright test to the config', async () => {
    await runTest(fixt, [
      '--create-check',
      '--',
      '--grep',
      '@TAG-B',
    ])

    const checklyConfig = await loadChecklyConfig(fixt.root)

    expect(checklyConfig.config?.checks).toBeDefined()
    expect(checklyConfig.config?.checks?.playwrightConfigPath).toBe('./playwright.config.ts')
    expect(checklyConfig.config?.checks?.playwrightChecks).toBeDefined()
    expect(checklyConfig.config?.checks?.playwrightChecks?.length).toBe(1)
    expect(checklyConfig.config?.checks?.playwrightChecks?.[0]?.name).toBe('Playwright Test: --grep @TAG-B')
    expect(checklyConfig.config?.checks?.playwrightChecks?.[0]?.testCommand).toBe('npx playwright test --grep @TAG-B')
    expect(checklyConfig.config?.checks?.playwrightChecks?.[0]?.frequency).toBe(10)
  })

  it('Should add a Playwright test with custom frequency', async () => {
    await runTest(fixt, [
      '--create-check',
      '--frequency',
      '5',
      '--',
      '--grep',
      '@TAG-B',
    ])

    const checklyConfig = await loadChecklyConfig(fixt.root)

    expect(checklyConfig.config?.checks).toBeDefined()
    expect(checklyConfig.config?.checks?.playwrightChecks).toBeDefined()
    expect(checklyConfig.config?.checks?.playwrightChecks?.length).toBe(1)
    expect(checklyConfig.config?.checks?.playwrightChecks?.[0]?.name).toBe('Playwright Test: --grep @TAG-B')
    expect(checklyConfig.config?.checks?.playwrightChecks?.[0]?.testCommand).toBe('npx playwright test --grep @TAG-B')
    expect(checklyConfig.config?.checks?.playwrightChecks?.[0]?.frequency).toBe(5)
  })
})
