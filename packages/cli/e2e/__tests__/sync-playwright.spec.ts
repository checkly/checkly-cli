import path from 'node:path'
import fs from 'node:fs'

import { ExecaError } from 'execa'
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest'

import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'
import { loadChecklyConfig } from '../../src/services/checkly-config-loader'

describe('sync-playwright', () => {
  describe('with playwright project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'test-playwright-project'),
        template: 'bare',
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    // Since we are modifying the file let's keep it clean after each test
    afterEach(() => {
      fs.copyFileSync(fixt.abspath('checkly.config.original.ts'), fixt.abspath('checkly.config.ts'))
    })

    it('should copy playwright config into checkly config', async () => {
      const { stdout } = await runCheckly(fixt, ['sync-playwright'])
      expect(stdout).toContain('Successfully updated Checkly config file')
      const checklyConfig = await loadChecklyConfig(fixt.root)
      expect(checklyConfig.config?.checks?.playwrightConfig).toBeDefined()
      expect(checklyConfig.config?.checks?.playwrightConfig?.timeout).toEqual(1234)
      expect(checklyConfig.config?.checks?.playwrightConfig?.use).toBeDefined()
      expect(checklyConfig.config?.checks?.playwrightConfig?.use?.baseURL).toEqual('http://127.0.0.1:3000')
      expect(checklyConfig.config?.checks?.playwrightConfig?.use?.proxy).toEqual({
        server: 'https://hello.com',
        username: 'username',
        password: 'password',
      })
      expect(checklyConfig.config?.checks?.playwrightConfig?.expect).toBeDefined()
    })
  })

  describe('without playwright project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'test-project'),
        template: 'bare',
      })
    }, 180_000)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should fail if no playwright config file exists', async () => {
      try {
        await runCheckly(fixt, ['sync-playwright'])
        expect.unreachable('Expected command to fail')
      } catch (err) {
        if (err instanceof ExecaError) {
          expect(err.exitCode).toBe(1)
          expect(err.stdout).toContain('Could not find any playwright.config file.')
        } else {
          throw err
        }
      }
    })
  })
})
